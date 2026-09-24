import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rate-limit";
import {
  checkCustomerSurveyRateLimit,
  findOrCreateClienteByTelefone,
  getPublicSurveyQuestions,
  getRegularQuestions,
  getSelectableGarcons,
  isNotaCritica,
  isValidGarcomIndicado,
  notifyCriticalResponse,
  onlyDigits,
  resolveTableByToken,
  tableState,
} from "@/lib/customer-survey-server";
import type { CustomerSurveyQuestion, CustomerSurveyQuestionType } from "@prisma/client";

/**
 * Resolve uma mesa/QR pública, sem sessão — mesmo padrão de
 * `GET /api/satisfaction/responder/[token]` (RH): rate limit primeiro, `state` explícito pro
 * client decidir a tela (nunca revela em texto a diferença entre "token nunca existiu" e
 * "mesa/loja desativada", só o `state`).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await checkCustomerSurveyRateLimit(req.headers, token))) {
    return NextResponse.json({ error: "Muitas tentativas, aguarde alguns minutos." }, { status: 429 });
  }

  const table = await resolveTableByToken(token);
  const state = tableState(table);
  if (state === "invalido") return NextResponse.json({ state }, { status: 404 });
  if (state !== "ok") return NextResponse.json({ state });

  const empresaId = table!.empresaId;
  const [{ notaGeralQuestion, perguntas }, garcons] = await Promise.all([
    getPublicSurveyQuestions(empresaId),
    getSelectableGarcons(empresaId),
  ]);

  const serializeQuestion = (q: CustomerSurveyQuestion) => ({
    id: q.id,
    tipo: q.tipo,
    titulo: q.titulo,
    tema: q.tema,
    obrigatoria: q.obrigatoria,
  });

  return NextResponse.json({
    state: "ok",
    empresa: { id: table!.empresa.id, name: table!.empresa.name, logo: table!.empresa.logo, color: table!.empresa.color },
    mesa: { numero: table!.numero },
    perguntas: {
      notaGeral: serializeQuestion(notaGeralQuestion),
      lista: perguntas.map(serializeQuestion),
    },
    garcons,
  });
}

type RespostaInput = { questionId?: string; valorNota?: number; valorGostei?: boolean; valorTexto?: string };

/** Só aceita a resposta se o VALOR bater com o tipo da pergunta — usado tanto pra decidir se uma
 *  pergunta obrigatória foi respondida quanto pra filtrar o que de fato vira `CustomerSurveyAnswer`. */
function extractAnswerData(tipo: CustomerSurveyQuestionType, resposta: RespostaInput | undefined) {
  if (!resposta) return null;
  if (tipo === "NOTA_0_5" || tipo === "NOTA_0_10") {
    const max = tipo === "NOTA_0_5" ? 5 : 10;
    if (!Number.isInteger(resposta.valorNota) || resposta.valorNota! < 0 || resposta.valorNota! > max) return null;
    return { valorNota: resposta.valorNota as number, valorGostei: null, valorTexto: null };
  }
  if (tipo === "GOSTEI_NAO_GOSTEI") {
    if (typeof resposta.valorGostei !== "boolean") return null;
    const valorTexto = typeof resposta.valorTexto === "string" ? resposta.valorTexto.trim() : "";
    return { valorNota: null, valorGostei: resposta.valorGostei, valorTexto: valorTexto || null };
  }
  // TEXTO_LIVRE
  const valorTexto = typeof resposta.valorTexto === "string" ? resposta.valorTexto.trim() : "";
  if (!valorTexto) return null;
  return { valorNota: null, valorGostei: null, valorTexto };
}

/**
 * Submete uma avaliação — mesmo padrão de `POST /api/satisfaction/responder/[token]` (RH):
 * rate limit + resolve mesa antes de qualquer coisa, nunca confia em `empresaId` vindo do corpo
 * (sempre o da MESA, resolvida pelo token). Grava `CustomerSurveyResponse` + `CustomerSurveyAnswer`
 * numa única escrita aninhada, calcula `critica` a partir de `CustomerSurveyConfig` da loja no
 * momento do submit (congelado, não recalculado depois — ver comentário no schema) e faz
 * find-or-create de `Cliente` por telefone (nunca duplica). Quando `critica = true`, dispara o
 * push automático (Fase 3, `notifyCriticalResponse`) pros destinatários configurados da loja.
 * Sem roleta ainda — Fase 6.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await checkCustomerSurveyRateLimit(req.headers, token))) {
    return NextResponse.json({ error: "Muitas tentativas, aguarde alguns minutos." }, { status: 429 });
  }

  const table = await resolveTableByToken(token);
  const state = tableState(table);
  if (state === "invalido") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (state !== "ok") return NextResponse.json({ error: "Essa mesa não está aceitando avaliações no momento." }, { status: 400 });

  const empresaId = table!.empresaId;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const nome = String(body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });

  const telefone = onlyDigits(String(body.telefone ?? ""));
  if (telefone.length < 8) return NextResponse.json({ error: "Informe um telefone válido." }, { status: 400 });

  if (!Number.isInteger(body.notaGeral) || body.notaGeral < 0 || body.notaGeral > 10) {
    return NextResponse.json({ error: "Dê uma nota de 0 a 10 para sua experiência." }, { status: 400 });
  }
  const notaGeral: number = body.notaGeral;

  let dataNascimentoInformada: Date | null = null;
  if (body.dataNascimento) {
    const parsed = new Date(body.dataNascimento);
    if (!Number.isNaN(parsed.getTime())) dataNascimentoInformada = parsed;
  }

  const garcomIndicadoId: string | null = body.garcomIndicadoId || null;
  if (garcomIndicadoId && !(await isValidGarcomIndicado(garcomIndicadoId, empresaId))) {
    return NextResponse.json({ error: "Garçom indicado inválido." }, { status: 400 });
  }

  // Só `getRegularQuestions` (não `getPublicSurveyQuestions`) de propósito: `notaGeral` já foi
  // validado acima como campo dedicado do body (0-10), não passa pelo loop de `respostas` — não
  // precisamos da pergunta fixa aqui, só das regulares. Evita acionar
  // `ensureFixedNotaGeralQuestion` (que pode fazer um SELECT + potencialmente um INSERT) em toda
  // submissão pública à toa (achado do Teulis).
  const perguntas = await getRegularQuestions(empresaId);
  const respostasInput: RespostaInput[] = Array.isArray(body.respostas) ? body.respostas : [];
  const inputByQuestionId = new Map(respostasInput.filter((r) => r?.questionId).map((r) => [r.questionId as string, r]));

  // Só considera perguntas do conjunto EFETIVO desta loja (resolvido no servidor, nunca a
  // partir do que o cliente mandou) — qualquer `questionId` submetido que não esteja aqui
  // (de outra loja, desativado, inventado) é simplesmente ignorado, nunca vira uma linha.
  const faltando: string[] = [];
  const answersToCreate: { questionId: string; valorNota: number | null; valorGostei: boolean | null; valorTexto: string | null }[] = [];
  for (const questao of perguntas) {
    const valor = extractAnswerData(questao.tipo, inputByQuestionId.get(questao.id));
    if (!valor) {
      if (questao.obrigatoria) faltando.push(questao.titulo);
      continue;
    }
    answersToCreate.push({ questionId: questao.id, ...valor });
  }
  if (faltando.length > 0) {
    return NextResponse.json({ error: `Responda todas as perguntas obrigatórias: ${faltando.join(", ")}.` }, { status: 400 });
  }

  const sugestao = typeof body.sugestao === "string" && body.sugestao.trim() ? body.sugestao.trim() : null;
  const critica = await isNotaCritica(empresaId, notaGeral);
  const cliente = await findOrCreateClienteByTelefone(empresaId, telefone, nome, dataNascimentoInformada);

  const response = await prisma.customerSurveyResponse.create({
    data: {
      empresaId,
      tableId: table!.id,
      clienteId: cliente.id,
      nomeInformado: nome,
      telefoneInformado: telefone,
      dataNascimentoInformada,
      garcomIndicadoId,
      notaGeral,
      critica,
      sugestao,
      ip: getClientIp(req.headers),
      respostas: { create: answersToCreate },
    },
  });

  if (response.critica) {
    await notifyCriticalResponse(response);
  }

  return NextResponse.json({ ok: true, responseId: response.id, critica: response.critica });
}
