import { NextResponse } from "next/server";
import type { FechamentoTipoResposta } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spDateKey, spDateTime, spStartOfDay } from "@/lib/checklist";
import { fechamentoPerguntasFaltando } from "@/lib/fechamento";
import { gerarFechamentoOcorrencias } from "@/lib/fechamento-server";
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
 * `FechamentoSubmissao` e cada `FechamentoResposta`, calculando se foi
 * enviado no prazo ou com atraso. Não gera `FechamentoOcorrencia` nenhuma
 * ainda (fase futura, quando o model existir) — mesmo quando uma pergunta
 * com `abreOcorrencia = true` é respondida de forma afirmativa.
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

  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canExecute", cargo.key))) {
    return NextResponse.json(
      { error: `Seu perfil de permissão não permite preencher o formulário de ${cargo.nome}.` },
      { status: 403 }
    );
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

  const releaseAt = spDateTime(dateKey, cargo.horarioLiberacao);
  const dueAt = spDateTime(dateKey, cargo.horarioLimite);
  const now = new Date();
  const atrasado = now.getTime() > dueAt.getTime();

  const submissao = await prisma.fechamentoSubmissao.upsert({
    where: { cargoId_data: { cargoId: cargo.id, data: day } },
    update: {
      notaGeral: notaGeral ?? undefined,
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
      notaGeral: notaGeral ?? null,
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
