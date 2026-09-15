import { NextResponse } from "next/server";
import type { FechamentoTipoResposta } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { spDateKey, spStartOfDay } from "@/lib/checklist";
import { fechamentoPerguntasFaltando, fechamentoReleaseEDueAt } from "@/lib/fechamento";
import { gerarFechamentoOcorrencias, podeExecutarFechamentoCargo } from "@/lib/fechamento-server";
import { isValidBlobUrl } from "@/lib/manutencao-server";

type RespostaInput = {
  perguntaId: string;
  valorBooleano?: boolean | null;
  valorTexto?: string | null;
  valorNumero?: number | null;
  valorNota?: number | null;
  opcaoId?: string | null;
  produtoId?: string | null;
  colaboradorId?: string | null;
  fotoUrl?: string | null;
  anexoUrl?: string | null;
};

/**
 * Submete o fechamento de um cargo num dia: cria/atualiza a
 * `FechamentoSubmissao` (calculando `notaGeral` — ver comentário mais abaixo
 * — e se foi enviado no prazo ou com atraso) e cada `FechamentoResposta`,
 * gerando (de forma idempotente) as `FechamentoOcorrencia` das respostas
 * "afirmativas" a perguntas com `abreOcorrencia = true` (ver
 * `gerarFechamentoOcorrencias`, em `@/lib/fechamento-server`).
 */
export async function POST(req: Request, { params }: { params: Promise<{ cargoId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cargoId } = await params;
  const cargo = await prisma.fechamentoCargo.findUnique({ where: { id: cargoId } });
  if (!cargo || !cargo.ativo) {
    return NextResponse.json({ error: "Cargo do Fechamento do Dia não encontrado." }, { status: 404 });
  }

  const temAcessoALoja = await assertEmpresaAccess(session.user.id, session.user.role, cargo.empresaId);
  if (!temAcessoALoja) {
    return NextResponse.json({ error: "Sem acesso a esta loja." }, { status: 403 });
  }

  const { pode, motivo } = await podeExecutarFechamentoCargo(session.user.id, session.user.role, cargo);
  if (!pode) {
    return NextResponse.json({ error: motivo }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const { date, notaGeral, respostas } = body as {
    date?: string;
    notaGeral?: number | null;
    respostas?: RespostaInput[];
  };
  if (!Array.isArray(respostas)) {
    return NextResponse.json({ error: "\"respostas\" precisa ser uma lista." }, { status: 400 });
  }
  if (notaGeral != null && (!Number.isInteger(notaGeral) || notaGeral < 1 || notaGeral > 5)) {
    return NextResponse.json({ error: "\"notaGeral\" precisa ser um número inteiro de 1 a 5." }, { status: 400 });
  }

  const dateKey = date || spDateKey();
  const day = spStartOfDay(dateKey);

  // Catálogo ativo deste cargo — a fonte da verdade de obrigatoriedade/condicionais/tipos.
  // Ignoramos qualquer perguntaId enviado que não esteja neste conjunto (nunca confiamos em
  // "obrigatoria"/"tipo" vindo do cliente, nem deixamos gravar resposta pra pergunta de outro
  // cargo/loja).
  const perguntasCargo = await prisma.fechamentoPerguntaCargo.findMany({
    where: { cargoId: cargo.id, pergunta: { ativa: true } },
    select: {
      pergunta: {
        select: {
          id: true,
          texto: true,
          tipo: true,
          obrigatoria: true,
          perguntaPaiId: true,
          valorPaiQueExibe: true,
        },
      },
    },
  });
  const perguntasPorId = new Map(perguntasCargo.map((pc) => [pc.pergunta.id, pc.pergunta]));

  const respostaPorPerguntaId = new Map<string, RespostaInput>();
  for (const r of respostas) {
    if (!r || typeof r.perguntaId !== "string" || !perguntasPorId.has(r.perguntaId)) continue;
    respostaPorPerguntaId.set(r.perguntaId, r);
  }

  // Textos das opções respondidas — só usado (por `fechamentoPerguntaObrigatoriaAgora`, em
  // @/lib/fechamento) pra decidir obrigatoriedade condicional quando o pai é MULTIPLA_ESCOLHA;
  // a função de validação em si é pura (não consulta o banco), por isso resolvemos aqui antes,
  // numa única busca em lote — reaproveitada também para a validação de referência cruzada
  // (opção pertence à pergunta certa) logo abaixo, em vez de duas buscas separadas.
  const opcaoIdsRespondidos = [...respostaPorPerguntaId.values()]
    .map((r) => r.opcaoId)
    .filter((id): id is string => !!id);
  const opcoesRespondidas =
    opcaoIdsRespondidos.length > 0
      ? await prisma.fechamentoPerguntaOpcao.findMany({
          where: { id: { in: opcaoIdsRespondidos } },
          select: { id: true, texto: true, perguntaId: true },
        })
      : [];
  const opcaoTextoPorId = new Map(opcoesRespondidas.map((o) => [o.id, o.texto]));
  const opcaoPerguntaIdPorId = new Map(opcoesRespondidas.map((o) => [o.id, o.perguntaId]));

  // Obrigatoriedade (ver fechamentoPerguntaObrigatoriaAgora: o catálogo é sempre a fonte da
  // verdade — uma pergunta filha com `obrigatoria: false` nunca é "promovida" a obrigatória só
  // por estar visível) + validações de tipo/referência que não dependem de obrigatoriedade.
  const erros: string[] = [...fechamentoPerguntasFaltando([...perguntasPorId.values()], respostaPorPerguntaId, opcaoTextoPorId)];
  const opcaoIdsAValidar: string[] = [];
  const produtoIdsAValidar: string[] = [];
  const colaboradorIdsAValidar: string[] = [];

  for (const [perguntaId, resposta] of respostaPorPerguntaId) {
    const pergunta = perguntasPorId.get(perguntaId)!;
    if (resposta.opcaoId) opcaoIdsAValidar.push(resposta.opcaoId);
    if (resposta.produtoId) produtoIdsAValidar.push(resposta.produtoId);
    if (resposta.colaboradorId) colaboradorIdsAValidar.push(resposta.colaboradorId);
    if (resposta.fotoUrl && !isValidBlobUrl(resposta.fotoUrl)) {
      erros.push(`Foto inválida em "${pergunta.texto}".`);
    }
    if (resposta.anexoUrl && !isValidBlobUrl(resposta.anexoUrl)) {
      erros.push(`Anexo inválido em "${pergunta.texto}".`);
    }
    if (pergunta.tipo === "NOTA_1_5" && resposta.valorNota != null) {
      if (!Number.isInteger(resposta.valorNota) || resposta.valorNota < 1 || resposta.valorNota > 5) {
        erros.push(`Nota inválida em "${pergunta.texto}" (precisa ser de 1 a 5).`);
      }
    }
  }

  if (erros.length > 0) {
    return NextResponse.json({ error: "Faltam respostas obrigatórias.", perguntasFaltando: erros }, { status: 400 });
  }

  // Referências cruzadas (opção pertence à pergunta certa; produto é da mesma loja do cargo;
  // colaborador existe) — nunca confiamos em ids soltos vindos do cliente.
  if (opcaoIdsAValidar.length > 0) {
    for (const [perguntaId, resposta] of respostaPorPerguntaId) {
      if (resposta.opcaoId && opcaoPerguntaIdPorId.get(resposta.opcaoId) !== perguntaId) {
        return NextResponse.json({ error: "Opção de resposta inválida para uma das perguntas." }, { status: 400 });
      }
    }
  }
  if (produtoIdsAValidar.length > 0) {
    const produtosValidos = await prisma.product.count({
      where: { id: { in: produtoIdsAValidar }, empresaId: cargo.empresaId },
    });
    if (produtosValidos !== new Set(produtoIdsAValidar).size) {
      return NextResponse.json({ error: "Produto inválido para uma das respostas." }, { status: 400 });
    }
  }
  if (colaboradorIdsAValidar.length > 0) {
    const colaboradoresValidos = await prisma.user.count({ where: { id: { in: colaboradorIdsAValidar } } });
    if (colaboradoresValidos !== new Set(colaboradorIdsAValidar).size) {
      return NextResponse.json({ error: "Colaborador inválido para uma das respostas." }, { status: 400 });
    }
  }

  const { releaseAt, dueAt } = fechamentoReleaseEDueAt(dateKey, cargo.horarioLiberacao, cargo.horarioLimite);
  const now = new Date();
  const atrasado = now.getTime() > dueAt.getTime();

  // "Nota geral" do dia — não é resposta de uma pergunta do catálogo (ver comentário do campo
  // em FechamentoSubmissao no schema), mas nenhum cliente hoje envia `notaGeral` explicitamente
  // no corpo da requisição (gap identificado nas fases anteriores). Por isso, quando o corpo não
  // traz um valor explícito, populamos automaticamente a partir da (única) pergunta RAIZ (sem
  // perguntaPaiId) do tipo NOTA_1_5 do catálogo deste cargo — hoje sempre exatamente uma por
  // cargo ("Como você avalia a operação hoje?"/"Como foi o salão hoje?"/"Como foi a cozinha
  // hoje?", confirmado em prisma/seed.ts). Se o catálogo mudar no futuro e o cargo passar a ter
  // 0 ou mais de 1 pergunta raiz desse tipo, não adivinhamos qual usar: `notaGeral` fica null
  // (ver relatório da Fase 4, Parte 2). Um valor explícito enviado pelo cliente sempre tem
  // prioridade sobre a derivação automática.
  let notaGeralFinal: number | null = notaGeral ?? null;
  if (notaGeralFinal == null) {
    const perguntasRaizNota = [...perguntasPorId.values()].filter((p) => p.tipo === "NOTA_1_5" && !p.perguntaPaiId);
    if (perguntasRaizNota.length === 1) {
      const valorNota = respostaPorPerguntaId.get(perguntasRaizNota[0].id)?.valorNota;
      if (valorNota != null && Number.isInteger(valorNota) && valorNota >= 1 && valorNota <= 5) {
        notaGeralFinal = valorNota;
      }
    }
  }

  const submissao = await prisma.fechamentoSubmissao.upsert({
    where: { cargoId_data: { cargoId: cargo.id, data: day } },
    update: {
      notaGeral: notaGeralFinal,
      enviadoPorId: session.user.id,
      enviadoEm: now,
      status: "ENVIADO",
    },
    create: {
      empresaId: cargo.empresaId,
      cargoId: cargo.id,
      data: day,
      releaseAt,
      dueAt,
      notaGeral: notaGeralFinal,
      enviadoPorId: session.user.id,
      enviadoEm: now,
      status: "ENVIADO",
    },
  });

  const respostasCriadas = await Promise.all(
    [...respostaPorPerguntaId.entries()].map(([perguntaId, r]) => {
      const tipo: FechamentoTipoResposta = perguntasPorId.get(perguntaId)!.tipo;
      // Só a coluna que corresponde ao `tipo` da pergunta é gravada — as demais ficam
      // explicitamente null (nunca `undefined`), pra um reenvio no mesmo dia sempre refletir
      // só o valor atual, sem deixar lixo de um valor antigo de outro tipo.
      const data = {
        valorBooleano: tipo === "SIM_NAO" ? (r.valorBooleano ?? null) : null,
        valorTexto: tipo === "TEXTO" ? (r.valorTexto ?? null) : null,
        valorNumero: tipo === "NUMERO" ? (r.valorNumero ?? null) : null,
        valorNota: tipo === "NOTA_1_5" ? (r.valorNota ?? null) : null,
        opcaoId: tipo === "MULTIPLA_ESCOLHA" ? (r.opcaoId ?? null) : null,
        produtoId: tipo === "PRODUTO" ? (r.produtoId ?? null) : null,
        colaboradorId: tipo === "COLABORADOR" ? (r.colaboradorId ?? null) : null,
        fotoUrl: tipo === "FOTO" ? (r.fotoUrl ?? null) : null,
        anexoUrl: tipo === "ANEXO" ? (r.anexoUrl ?? null) : null,
      };
      return prisma.fechamentoResposta.upsert({
        where: { submissaoId_perguntaId: { submissaoId: submissao.id, perguntaId } },
        update: data,
        create: { submissaoId: submissao.id, perguntaId, ...data },
      });
    })
  );

  // Gera (de forma idempotente) as Ocorrências das respostas "afirmativas" a perguntas com
  // abreOcorrencia=true — sempre depois de gravar as respostas, já que a extração de
  // categoria/descrição lê as respostas das perguntas-filha (ver gerarFechamentoOcorrencias,
  // em @/lib/fechamento-server).
  const ocorrencias = await gerarFechamentoOcorrencias(submissao.id);

  return NextResponse.json({ submissao, respostas: respostasCriadas, atrasado, ocorrencias });
}
