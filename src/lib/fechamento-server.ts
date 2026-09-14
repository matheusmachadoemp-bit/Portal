import type { FechamentoOcorrencia } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { spDateKey, spDateTime, spStartOfDay, weekdayFieldFor } from "@/lib/checklist";
import { computeFechamentoStatus } from "@/lib/fechamento";
import { createNotification } from "@/lib/notifications";
import { getStoreManagers } from "@/lib/manutencao-server";
import { hasModulePermission } from "@/lib/authz";

/**
 * Decide se um usuário pode de fato preencher o formulário de UM `FechamentoCargo` específico —
 * ajuste de segurança pedido depois de confirmar (contra dados reais) que o `canExecute` do
 * perfil de permissão sozinho é uma checagem GENÉRICA demais: todo perfil "funcionário"/
 * "supervisor"/"líder" tem `canExecute` para os 3 cargos ao mesmo tempo, então ele nunca
 * garantiu que quem está enviando é de fato quem ocupa ESTE cargo nesta loja — só que o perfil
 * dele, em geral, permite executar formulários do módulo.
 *
 * Combina as duas camadas (as DUAS precisam passar — decisão de manter `canExecute` como um
 * filtro a mais, não substituí-lo: um perfil sem `canExecute` nenhum continua barrado mesmo que
 * o `Employee` vinculado tenha o cargo certo, ex. alguém suspenso/com perfil revogado):
 *
 * 1. `canExecute` do perfil de permissão pra este cargo (`hasModulePermission`, como já era).
 * 2. `User.employee.cargo` (ficha de RH vinculada ao login) bater, por igualdade exata de
 *    texto, com `FechamentoCargo.nome` — sem normalização de acento/maiúscula por ora (decisão
 *    registrada no relatório: ajuste fácil depois, se aparecer divergência real nos dados).
 *
 * Administrador sempre libera, sem depender de ficha de RH nenhuma (mesmo critério de sempre —
 * nem chega a cair no `canExecute`, que já libera geral pra ADMINISTRADOR). "Gestor" (perfil que
 * hoje só tem `canView` nas subcategorias de cargo, nunca `canExecute`) NÃO ganhou nenhum bypass
 * especial aqui — decisão do usuário registrada no relatório: só administrador dispensa a ficha
 * de RH: um gestor que precisar preencher em nome de alguém em emergência precisa, por ora, ter
 * uma ficha de `Employee` vinculada com o cargo certo, igual qualquer outro usuário.
 *
 * Usado tanto pela rota de submissão (que retorna 403 com `motivo` como mensagem de erro) quanto
 * pela rota de status do dia (que só usa `pode`, pra decidir se mostra o botão "Preencher
 * Agora" — sem isso, o botão podia aparecer pra alguém que a submissão real barra, uma
 * inconsistência que o próprio usuário pediu pra evitar).
 */
export async function podeExecutarFechamentoCargo(
  userId: string,
  role: string,
  cargo: { key: string; nome: string }
): Promise<{ pode: boolean; motivo?: string }> {
  if (role === "ADMINISTRADOR") return { pode: true };

  const podeExecutarPerfil = await hasModulePermission(userId, "fechamento-dia", "canExecute", cargo.key);
  if (!podeExecutarPerfil) {
    return { pode: false, motivo: `Seu perfil de permissão não permite preencher o formulário de ${cargo.nome}.` };
  }

  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { cargo: true } } },
  });
  if (!usuario?.employee) {
    return {
      pode: false,
      motivo: `Seu usuário não está vinculado a uma ficha de RH com o cargo de ${cargo.nome}. Peça a um administrador para vincular seu usuário à ficha certa em Usuários.`,
    };
  }
  if (usuario.employee.cargo !== cargo.nome) {
    return {
      pode: false,
      motivo: `Seu cargo cadastrado no RH ("${usuario.employee.cargo}") não corresponde a este formulário (${cargo.nome}).`,
    };
  }
  return { pode: true };
}

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
 *
 * O `findMany` abaixo roda ANTES de `refreshFechamentoStatuses` persistir uma eventual
 * transição de status (ex.: PENDENTE -> ATRASADO, quando o prazo acabou de vencer) — devolver
 * esses objetos direto da consulta reproduzia um bug real (achado durante a validação da Fase
 * 4, Parte 3): a primeira leitura do dia depois do prazo vencer devolvia o status ANTIGO (a
 * gravação no banco acontecia certa, só o retorno desta função ficava um passo atrasado),
 * corrigindo sozinho só numa segunda leitura. Por isso recalculamos "ao vivo"
 * (`computeFechamentoStatus`, função pura, sem consulta extra) por cima do resultado antes de
 * devolver — mesma solução já usada em `getFechamentoResumoData` mais abaixo. A gravação via
 * `refreshFechamentoStatuses` continua acontecendo normalmente (útil pra quem ler
 * `FechamentoSubmissao` direto depois); só o valor DEVOLVIDO por esta função deixa de confiar no
 * `status` lido antes do refresh.
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
  const now = new Date();
  return submissoes.map((s) => ({
    ...s,
    status: computeFechamentoStatus({ dueAt: s.dueAt, enviadoEm: s.enviadoEm, now }),
  }));
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

// ---------------------------------------------------------------------------
// FECHAMENTO DO DIA — Fase 4 (Parte 3): indicadores agregados (nota média,
// taxa de envio no prazo/atrasado, ocorrências por gravidade/categoria) —
// base de dados pra uma tela futura de relatório, mesmo papel de
// `getManutencaoRelatorioData` (@/lib/manutencao-server) e
// `getIndicadoresData` (@/lib/producao-indicadores-server) pros respectivos
// módulos. Só agrega dado que já existe hoje (FechamentoSubmissao +
// FechamentoOcorrencia) — nenhuma tabela nova.
// ---------------------------------------------------------------------------

type GrupoContagem = { key: string; nome: string; total: number };
type GrupoMedia = { key: string; nome: string; valor: number; quantidade: number };

function agruparContagem<T>(items: T[], keyFn: (item: T) => string, labelFn: (item: T) => string): GrupoContagem[] {
  const grupos = new Map<string, GrupoContagem>();
  for (const item of items) {
    const key = keyFn(item);
    const atual = grupos.get(key) ?? { key, nome: labelFn(item), total: 0 };
    atual.total += 1;
    grupos.set(key, atual);
  }
  return [...grupos.values()];
}

function agruparMedia<T>(items: T[], keyFn: (item: T) => string, labelFn: (item: T) => string, valorFn: (item: T) => number): GrupoMedia[] {
  const grupos = new Map<string, { key: string; nome: string; soma: number; quantidade: number }>();
  for (const item of items) {
    const key = keyFn(item);
    const atual = grupos.get(key) ?? { key, nome: labelFn(item), soma: 0, quantidade: 0 };
    atual.soma += valorFn(item);
    atual.quantidade += 1;
    grupos.set(key, atual);
  }
  return [...grupos.values()]
    .map(({ key, nome, soma, quantidade }) => ({ key, nome, valor: Math.round((soma / quantidade) * 100) / 100, quantidade }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Indicadores do período `[from, to]` (inclusive nos dois extremos — ambos já esperados como
 * meia-noite de São Paulo, mesma convenção de `FechamentoSubmissao.data`/`FechamentoOcorrencia.
 * data`) para as lojas em `empresaIds`. Usado por `GET /api/fechamento-dia/indicadores`.
 *
 * "Taxa de envio no prazo vs. atrasado": classifica cada `FechamentoSubmissao` do período
 * recomputando o status "ao vivo" (`computeFechamentoStatus`, @/lib/fechamento) em vez de
 * confiar direto na coluna `status` gravada — ela só é persistida quando algo relê aquele dia
 * específico (`refreshFechamentoStatuses`), então uma submissão vencida há muito tempo sem
 * ninguém ter revisitado aquele dia continuaria com o valor antigo gravado no banco. Uma
 * ressalva permanece mesmo assim (documentada no relatório da Fase 4): só existe uma linha de
 * `FechamentoSubmissao` para um cargo/dia depois que ALGUÉM enviou o formulário OU visitou a
 * tela de status daquele dia (`generateFechamentoSubmissoes`, chamada por
 * `loadFechamentoSubmissoesDoDia`) — um dia em que ninguém nunca abriu a tela nem enviou nada
 * simplesmente não tem linha nenhuma, e por isso não entra nesta conta (nem como "no prazo" nem
 * como "atrasado"). Na prática isso deve ser raro (a tela de Status do Dia é o objetivo central
 * do módulo, visitada diariamente), mas é uma subestimação real do "não enviado" que vale a pena
 * ter em mente ao ler o indicador.
 */
export async function getFechamentoResumoData(empresaIds: string[], from: Date, to: Date) {
  const now = new Date();

  const [submissoes, ocorrencias] = await Promise.all([
    prisma.fechamentoSubmissao.findMany({
      where: { empresaId: { in: empresaIds }, data: { gte: from, lte: to } },
      select: {
        empresaId: true,
        notaGeral: true,
        enviadoEm: true,
        dueAt: true,
        empresa: { select: { name: true } },
        cargo: { select: { key: true, nome: true } },
      },
    }),
    prisma.fechamentoOcorrencia.findMany({
      where: { empresaId: { in: empresaIds }, data: { gte: from, lte: to } },
      select: {
        gravidade: true,
        categoriaId: true,
        categoria: { select: { nome: true } },
      },
    }),
  ]);

  // 1) Nota média (notaGeral) por loja e por cargo — só entre submissões que de fato têm
  // notaGeral preenchido (ver Parte 2: só passou a ser populado a partir desta fase; submissões
  // antigas continuam null e ficam de fora da média, não contam como "nota zero").
  const comNota = submissoes.filter((s) => s.notaGeral != null);
  const notaMediaPorLoja = agruparMedia(comNota, (s) => s.empresaId, (s) => s.empresa.name, (s) => s.notaGeral as number);
  const notaMediaPorCargo = agruparMedia(comNota, (s) => s.cargo.key, (s) => s.cargo.nome, (s) => s.notaGeral as number);

  // 2) Taxa de envio no prazo vs. atrasado (ver ressalva sobre cobertura no comentário da
  // função). PENDENTE (ainda dentro do prazo, ninguém enviou ainda) fica de fora da conta: não é
  // justo classificar como "atraso" algo que ainda pode ser enviado a tempo.
  let enviadosNoPrazo = 0;
  let enviadosComAtraso = 0;
  let naoEnviados = 0;
  for (const s of submissoes) {
    if (s.enviadoEm) {
      if (s.enviadoEm.getTime() <= s.dueAt.getTime()) enviadosNoPrazo++;
      else enviadosComAtraso++;
    } else if (computeFechamentoStatus({ dueAt: s.dueAt, enviadoEm: null, now }) === "ATRASADO") {
      naoEnviados++;
    }
  }
  const totalConsiderado = enviadosNoPrazo + enviadosComAtraso + naoEnviados;

  // 3) Contagem de ocorrências por gravidade e por categoria.
  const ocorrenciasPorGravidade = agruparContagem(ocorrencias, (o) => o.gravidade, (o) => o.gravidade);
  const ocorrenciasPorCategoria = agruparContagem(ocorrencias, (o) => o.categoriaId, (o) => o.categoria.nome);

  // 4) Top categorias com mais ocorrências — mesma contagem por categoria acima, só ordenada e
  // limitada às 5 primeiras (mesmo padrão de "top N" de `getManutencaoRelatorioData`,
  // @/lib/manutencao-server, ex. `gastosPorEquipamento.slice(0, 10)`).
  const topCategorias = [...ocorrenciasPorCategoria].sort((a, b) => b.total - a.total).slice(0, 5);

  return {
    notaMediaPorLoja,
    notaMediaPorCargo,
    envio: {
      enviadosNoPrazo,
      enviadosComAtraso,
      naoEnviados,
      totalConsiderado,
      taxaNoPrazoPercent: totalConsiderado > 0 ? Math.round((enviadosNoPrazo / totalConsiderado) * 1000) / 10 : null,
    },
    ocorrenciasPorGravidade,
    ocorrenciasPorCategoria,
    topCategorias,
    totalSubmissoes: submissoes.length,
    totalOcorrencias: ocorrencias.length,
  };
}
