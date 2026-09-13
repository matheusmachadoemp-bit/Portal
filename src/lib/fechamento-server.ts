import type { FechamentoOcorrencia } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { spDateKey, spDateTime, spStartOfDay, weekdayFieldFor } from "@/lib/checklist";
import { computeFechamentoStatus } from "@/lib/fechamento";
import { createNotification } from "@/lib/notifications";
import { getStoreManagers } from "@/lib/manutencao-server";

/**
 * Gera (de forma idempotente, via @@unique([cargoId, data])) as submissões
 * do dia `dateKey` para os cargos ativos das empresas informadas — só nos
 * dias da semana marcados no cargo. Mesmo papel de
 * `generateChecklistOccurrences` (src/lib/checklist-server.ts) para o
 * Checklist.
 */
export async function generateFechamentoSubmissoes(empresaIds: string[], dateKey: string = spDateKey()) {
  if (empresaIds.length === 0) return;

  const day = spStartOfDay(dateKey);
  const weekdayField = weekdayFieldFor(dateKey);

  const cargos = await prisma.fechamentoCargo.findMany({
    where: { empresaId: { in: empresaIds }, ativo: true, [weekdayField]: true },
    select: { id: true, empresaId: true, horarioLiberacao: true, horarioLimite: true },
  });

  await Promise.all(
    cargos.map((c) => {
      const releaseAt = spDateTime(dateKey, c.horarioLiberacao);
      const dueAt = spDateTime(dateKey, c.horarioLimite);
      return prisma.fechamentoSubmissao.upsert({
        where: { cargoId_data: { cargoId: c.id, data: day } },
        update: {},
        create: {
          empresaId: c.empresaId,
          cargoId: c.id,
          data: day,
          releaseAt,
          dueAt,
        },
      });
    })
  );
}

/** Recalcula (e persiste, se mudou) o status "ao vivo" de cada submissão. */
export async function refreshFechamentoStatuses(submissaoIds: string[]) {
  if (submissaoIds.length === 0) return;
  const submissoes = await prisma.fechamentoSubmissao.findMany({
    where: { id: { in: submissaoIds } },
    select: { id: true, dueAt: true, enviadoEm: true, status: true },
  });
  const now = new Date();
  await Promise.all(
    submissoes.map((s) => {
      const next = computeFechamentoStatus({ dueAt: s.dueAt, enviadoEm: s.enviadoEm, now });
      if (next === s.status) return null;
      return prisma.fechamentoSubmissao.update({ where: { id: s.id }, data: { status: next } });
    })
  );
}

/**
 * Gera (se necessário) e devolve as submissões do dia `dateKey` das
 * empresas informadas, com o status já atualizado no banco. Usado pela
 * rota de status do dia.
 */
export async function loadFechamentoSubmissoesDoDia(empresaIds: string[], dateKey: string = spDateKey()) {
  await generateFechamentoSubmissoes(empresaIds, dateKey);
  const day = spStartOfDay(dateKey);
  const submissoes = await prisma.fechamentoSubmissao.findMany({
    where: { empresaId: { in: empresaIds }, data: day },
  });
  if (submissoes.length > 0) {
    await refreshFechamentoStatuses(submissoes.map((s) => s.id));
  }
  return submissoes;
}

// ---------------------------------------------------------------------------
// Fase 3 — Ocorrência: geração automática a partir de resposta "afirmativa" +
// notificação de gravidade Crítica. Ver comentário de `FechamentoOcorrencia`
// em schema.prisma para o racional completo de escopo (Task/Chamado só).
// ---------------------------------------------------------------------------

// Nomes literais das perguntas-filha do catálogo real (prisma/seed.ts), usados para extrair
// cada campo da Ocorrência a partir das respostas da submissão. "O que aconteceu?" é exclusiva
// do Gerente (única exceção sem `categoriaSugerida` fixo — a categoria vem da filha
// "Categoria" em vez do catálogo); "Descrição" é usada pelas 14 perguntas SIM_NAO do Chef de
// Salão/Cozinha. Se o catálogo mudar esses textos no futuro, esta extração para de encontrar a
// filha certa e cai no fallback (descricao = texto da própria pergunta-gatilho) — não quebra,
// só fica menos específico.
const FILHA_CATEGORIA_TEXTO = "Categoria";
const FILHA_DESCRICAO_TEXTOS = ["O que aconteceu?", "Descrição"];
const FILHA_COMO_FOI_RESOLVIDO_TEXTO = "Como foi resolvido?";
const FILHA_PENDENCIA_TEXTO = "Ficou alguma pendência para amanhã?";

/**
 * Gera as `FechamentoOcorrencia` de uma submissão: para cada pergunta com `abreOcorrencia =
 * true` do cargo, se a resposta registrada for "afirmativa" (`valorBooleano === true` — hoje a
 * única forma que existe no catálogo real, ver comentário do model no schema), cria uma
 * ocorrência (idempotente via `@@unique` em `respostaId`: chamar de novo pra uma resposta que
 * já gerou ocorrência não duplica nem sobrescreve categoria/gravidade/status que um humano
 * já possa ter ajustado manualmente). Chamada pela rota de submissão logo depois de gravar as
 * `FechamentoResposta`.
 */
export async function gerarFechamentoOcorrencias(submissaoId: string): Promise<FechamentoOcorrencia[]> {
  const submissao = await prisma.fechamentoSubmissao.findUnique({ where: { id: submissaoId } });
  if (!submissao) return [];

  const perguntasGatilho = await prisma.fechamentoPerguntaCargo.findMany({
    where: { cargoId: submissao.cargoId, pergunta: { ativa: true, abreOcorrencia: true } },
    select: {
      pergunta: {
        select: {
          id: true,
          texto: true,
          tipo: true,
          categoriaSugeridaId: true,
          gravidadeSugerida: true,
          condicionais: { select: { id: true, texto: true } },
        },
      },
    },
  });
  if (perguntasGatilho.length === 0) return [];

  const todasRespostas = await prisma.fechamentoResposta.findMany({ where: { submissaoId } });
  const respostaPorPerguntaId = new Map(todasRespostas.map((r) => [r.perguntaId, r]));

  const categoriaOutro = await prisma.fechamentoCategoria.findFirst({
    where: { empresaId: submissao.empresaId, nome: "Outro" },
  });

  const resultado: FechamentoOcorrencia[] = [];

  for (const { pergunta } of perguntasGatilho) {
    const resposta = respostaPorPerguntaId.get(pergunta.id);
    if (!resposta) continue;

    if (pergunta.tipo !== "SIM_NAO") {
      // Nenhuma pergunta MULTIPLA_ESCOLHA usa abreOcorrencia hoje (confirmado contra o
      // catálogo real do seed) — sem uma convenção de "qual opção conta como afirmativa",
      // gerar uma ocorrência aqui seria um palpite. Loga em vez de arriscar.
      console.warn(
        `[fechamento] pergunta "${pergunta.texto}" tem abreOcorrencia=true e tipo=${pergunta.tipo} — geração de ocorrência só suporta SIM_NAO hoje, pulando.`
      );
      continue;
    }
    if (resposta.valorBooleano !== true) continue;

    const existente = await prisma.fechamentoOcorrencia.findUnique({ where: { respostaId: resposta.id } });
    if (existente) {
      resultado.push(existente);
      continue;
    }

    // Categoria: fixa no catálogo (categoriaSugeridaId) ou, só no caso do Gerente, escolhida na
    // pergunta-filha "Categoria" (ver FechamentoPergunta no schema.prisma).
    let categoriaId = pergunta.categoriaSugeridaId;
    if (!categoriaId) {
      const filhaCategoria = pergunta.condicionais.find((f) => f.texto === FILHA_CATEGORIA_TEXTO);
      const respostaCategoria = filhaCategoria ? respostaPorPerguntaId.get(filhaCategoria.id) : undefined;
      if (respostaCategoria?.opcaoId) {
        const opcao = await prisma.fechamentoPerguntaOpcao.findUnique({ where: { id: respostaCategoria.opcaoId } });
        if (opcao) {
          const categoria = await prisma.fechamentoCategoria.findFirst({
            where: { empresaId: submissao.empresaId, nome: opcao.texto },
          });
          categoriaId = categoria?.id ?? null;
        }
      }
    }
    categoriaId = categoriaId ?? categoriaOutro?.id ?? null;
    if (!categoriaId) {
      console.error(
        `[fechamento] não foi possível resolver categoria (nem "Outro" existe) para a empresa ${submissao.empresaId} — ocorrência da pergunta "${pergunta.texto}" não gerada.`
      );
      continue;
    }

    const filhaDescricao = pergunta.condicionais.find((f) => FILHA_DESCRICAO_TEXTOS.includes(f.texto));
    const descricaoResposta = filhaDescricao ? respostaPorPerguntaId.get(filhaDescricao.id) : undefined;
    const descricao = descricaoResposta?.valorTexto?.trim() || pergunta.texto;

    const filhaResolvido = pergunta.condicionais.find((f) => f.texto === FILHA_COMO_FOI_RESOLVIDO_TEXTO);
    const comoFoiResolvido = filhaResolvido ? (respostaPorPerguntaId.get(filhaResolvido.id)?.valorTexto ?? null) : null;

    const filhaPendencia = pergunta.condicionais.find((f) => f.texto === FILHA_PENDENCIA_TEXTO);
    const pendencia = filhaPendencia ? (respostaPorPerguntaId.get(filhaPendencia.id)?.valorTexto ?? null) : null;

    const ocorrencia = await prisma.fechamentoOcorrencia.create({
      data: {
        empresaId: submissao.empresaId,
        cargoId: submissao.cargoId,
        data: submissao.data,
        submissaoId: submissao.id,
        perguntaId: pergunta.id,
        respostaId: resposta.id,
        categoriaId,
        gravidade: pergunta.gravidadeSugerida ?? "ATENCAO",
        descricao,
        comoFoiResolvido,
        pendencia,
      },
    });
    resultado.push(ocorrencia);

    if (ocorrencia.gravidade === "CRITICO") {
      await notificarFechamentoOcorrenciaCritica(ocorrencia);
    }
  }

  return resultado;
}

/**
 * Notifica a ocorrência recém-criada com gravidade Crítica — reaproveita a mesma
 * infraestrutura de notificação (sino + push Web Push já configurado, `createNotification` em
 * `@/lib/notifications`) usada por Tarefas/Manutenção/etc., não um canal novo. Destinatário:
 * `FechamentoCargo.superiorEscalonamento` (campo que já existe desde a Fase 1, pensado
 * exatamente pra escalonamento) quando cadastrado; sem isso configurado (nenhuma loja tem esse
 * campo preenchido hoje, não existe tela pra isso ainda), cai para os gestores da loja
 * (administrador/gestor/gerente com acesso), mesmo critério de `getStoreManagers` já usado por
 * Manutenção — nunca fica "ninguém notificado" por falta de configuração.
 */
async function notificarFechamentoOcorrenciaCritica(ocorrencia: FechamentoOcorrencia): Promise<void> {
  const [cargo, empresa] = await Promise.all([
    prisma.fechamentoCargo.findUnique({ where: { id: ocorrencia.cargoId }, select: { superiorEscalonamentoId: true, nome: true } }),
    prisma.empresa.findUnique({ where: { id: ocorrencia.empresaId }, select: { name: true } }),
  ]);

  const destinatarios = new Set<string>();
  if (cargo?.superiorEscalonamentoId) destinatarios.add(cargo.superiorEscalonamentoId);
  if (destinatarios.size === 0) {
    const gestores = await getStoreManagers(ocorrencia.empresaId);
    gestores.forEach((id) => destinatarios.add(id));
  }
  if (destinatarios.size === 0) return;

  await Promise.all(
    [...destinatarios].map((userId) =>
      createNotification({
        userId,
        type: "FECHAMENTO_OCORRENCIA_CRITICA",
        title: "Ocorrência crítica no Fechamento do Dia",
        body: `${cargo?.nome ?? "Fechamento do Dia"}${empresa?.name ? ` — ${empresa.name}` : ""}: ${ocorrencia.descricao}`,
        priority: "CRITICA",
        fechamentoOcorrenciaId: ocorrencia.id,
        url: `/portal/fechamento-dia/ocorrencias/${ocorrencia.id}`,
      })
    )
  );
}
