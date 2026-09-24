import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { ensureFixedNotaGeralQuestion } from "@/lib/customer-survey-server";
import type { CustomerSurveyQuestion, CustomerSurveyQuestionType } from "@prisma/client";

const TIPOS_VALIDOS: CustomerSurveyQuestionType[] = ["NOTA_0_5", "NOTA_0_10", "GOSTEI_NAO_GOSTEI", "TEXTO_LIVRE"];

/**
 * Perguntas compartilhadas (`empresaId = null`, catálogo padrão seedado) e próprias da loja
 * ativa (`empresaId = <loja>`) — somadas (UNION), nunca uma substitui a outra por inteiro
 * (ver comentário em `getRegularQuestions`, src/lib/customer-survey-server.ts). `efetivas` é o
 * mesmo conjunto (nota geral + regulares) que o formulário público de fato usa — devolvido aqui
 * só como conveniência, pra uma futura tela de administração poder mostrar "é isso que o
 * cliente vê hoje" sem precisar recalcular nada.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "perguntas"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver as perguntas de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível gerenciar perguntas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const [notaGeralQuestion, compartilhadas, proprias] = await Promise.all([
    ensureFixedNotaGeralQuestion(),
    prisma.customerSurveyQuestion.findMany({
      where: { empresaId: null, fixaNotaGeral: false },
      orderBy: { ordem: "asc" },
    }),
    prisma.customerSurveyQuestion.findMany({
      where: { empresaId: empresa.id },
      orderBy: { ordem: "asc" },
    }),
  ]);

  // `efetivas` montado EM MEMÓRIA a partir de `compartilhadas`/`proprias` (só filtrando
  // `ativo`) em vez de uma 4ª ida ao banco (`getRegularQuestions`) — as duas listas acima já têm
  // tudo que a query faria de novo, só precisa somar e ordenar (achado de otimização do Teulis).
  const perguntasEfetivas = [...compartilhadas, ...proprias]
    .filter((q) => q.ativo && !q.fixaNotaGeral)
    .sort((a: CustomerSurveyQuestion, b: CustomerSurveyQuestion) => a.ordem - b.ordem);

  return NextResponse.json({
    notaGeralQuestion,
    compartilhadas,
    proprias,
    efetivas: [notaGeralQuestion, ...perguntasEfetivas],
  });
}

/**
 * Sempre cria na loja ativa (`empresaId = empresa.id`) — este endpoint é escopado a UMA loja
 * (bloqueado em modo Grupo Nord logo abaixo), então nunca deve escrever no catálogo
 * compartilhado (`empresaId = null`, só mexido pelo seed por enquanto). `fixaNotaGeral` nunca é
 * aceito do corpo da requisição — a pergunta de nota geral é gerida só por
 * `ensureFixedNotaGeralQuestion` (bootstrap automático), nunca por esta rota, pra nunca existir
 * mais de uma marcada como tal.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canCreate", "perguntas"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar perguntas de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar perguntas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const titulo = String(body?.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ error: "Informe o título da pergunta." }, { status: 400 });

  const tipo = body?.tipo as CustomerSurveyQuestionType;
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: "Tipo de pergunta inválido." }, { status: 400 });
  }

  let ordem: number;
  if (Number.isFinite(body?.ordem)) {
    ordem = Math.round(body.ordem);
  } else {
    const maxOrdem = await prisma.customerSurveyQuestion.aggregate({
      where: { empresaId: empresa.id },
      _max: { ordem: true },
    });
    ordem = (maxOrdem._max.ordem ?? -1) + 1;
  }

  const pergunta = await prisma.customerSurveyQuestion.create({
    data: {
      empresaId: empresa.id,
      tipo,
      titulo,
      tema: body?.tema ? String(body.tema).trim() : null,
      obrigatoria: body?.obrigatoria !== false,
      ordem,
      ativo: body?.ativo !== false,
      fixaNotaGeral: false,
    },
  });

  return NextResponse.json({ pergunta });
}
