import { NextResponse } from "next/server";
import { checkCustomerSurveyRateLimit, resolveTableByToken, tableState } from "@/lib/customer-survey-server";
import { consultarGiroExistente, girarRoleta } from "@/lib/roulette-server";

/**
 * Recupera o resultado de um giro JÁ processado no servidor para esta avaliação — achado P4
 * (Nina): sem este `GET`, se a RESPOSTA do `POST` abaixo se perdesse no caminho (ex.: queda de
 * rede bem depois do giro já ter sido gravado com sucesso), o cliente não tinha nenhuma forma
 * de descobrir se ganhou algo e qual foi o prêmio — um retry do `POST` só devolve "Você já
 * girou a roleta para esta avaliação." (constraint `@unique` em `RouletteSpin.responseId`),
 * sem revelar o resultado.
 *
 * Mesmo token/rate-limit/resolução de mesa do `POST` irmão (ver abaixo) — só leitura, nunca cria
 * nem altera nenhum giro (ver `consultarGiroExistente`, src/lib/roulette-server.ts). O corpo da
 * tela (`roleta-wheel.tsx`) não foi alterado nesta tarefa — isto só expõe o dado; usar este `GET`
 * para recuperar o resultado ao recarregar a página é uma sugestão separada para o Caio, fora do
 * escopo daqui.
 *
 * `responseId` vem como query string (`?responseId=...`) por ser um `GET` — mesmo id devolvido
 * pelo `POST .../responder/[token]` que o client já guarda para chamar o `POST .../girar`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await checkCustomerSurveyRateLimit(req.headers, token))) {
    return NextResponse.json({ error: "Muitas tentativas, aguarde alguns minutos." }, { status: 429 });
  }

  const table = await resolveTableByToken(token);
  const state = tableState(table);
  if (state === "invalido") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (state !== "ok") return NextResponse.json({ error: "Essa mesa não está aceitando avaliações no momento." }, { status: 400 });

  const responseId = new URL(req.url).searchParams.get("responseId")?.trim() ?? "";
  if (!responseId) return NextResponse.json({ error: "Avaliação inválida." }, { status: 400 });

  const resultado = await consultarGiroExistente({
    responseId,
    empresaIdEsperado: table!.empresaId,
    tableIdEsperado: table!.id,
  });

  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 });
  if (!resultado.existe) return NextResponse.json({ ok: true, existe: false });

  if (resultado.resultado === "tente_novamente") {
    return NextResponse.json({ ok: true, existe: true, resultado: "tente_novamente" });
  }

  return NextResponse.json({
    ok: true,
    existe: true,
    resultado: "premio",
    codigo: resultado.codigo,
    validadeAte: resultado.validadeAte,
    premio: resultado.premio,
  });
}

/**
 * Gira a roleta de prêmios para uma avaliação recém-submetida.
 *
 * Caminho escolhido — `POST /api/satisfacao-cliente/responder/[token]/girar` — em vez de uma rota
 * própria tipo `POST /api/satisfacao-cliente/roleta/girar` com token no corpo, por dois motivos:
 *
 * 1. Reaproveita o MESMO rate limit (`checkCustomerSurveyRateLimit`, chave `ip+token`) já
 *    aplicado ao GET/POST irmãos deste arquivo (`.../responder/[token]/route.ts`) — o giro
 *    acontece imediatamente depois do submit, na mesma sessão de página/mesma mesa, então
 *    compartilhar o contador é o comportamento certo (mesmo grupo grande numa mesa girando em
 *    sequência não deveria estourar um limite dedicado zerado).
 * 2. O token da mesa já resolve `table.empresaId` E `table.id` no servidor — usados aqui como
 *    verificação extra de posse: além de exigir que a `CustomerSurveyResponse` referenciada por
 *    `responseId` exista e ainda não tenha giro (únicas validações pedidas na tarefa), também
 *    confere que essa resposta pertence exatamente a ESTA mesa/token (não só à mesma loja) —
 *    nunca confia em nenhum id vindo do corpo sem checar posse contra algo resolvido a partir do
 *    token, mesmo padrão do resto do fluxo público deste módulo.
 *
 * O corpo só precisa de `responseId` — o cliente já tem esse id na resposta do
 * `POST .../responder/[token]` que acabou de submeter (não reabre nada pelo token).
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

  const body = await req.json().catch(() => null);
  const responseId = typeof body?.responseId === "string" ? body.responseId.trim() : "";
  if (!responseId) return NextResponse.json({ error: "Avaliação inválida." }, { status: 400 });

  const resultado = await girarRoleta({
    responseId,
    empresaIdEsperado: table!.empresaId,
    tableIdEsperado: table!.id,
  });

  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 });

  if (resultado.resultado === "tente_novamente") {
    return NextResponse.json({ ok: true, resultado: "tente_novamente" });
  }

  return NextResponse.json({
    ok: true,
    resultado: "premio",
    codigo: resultado.codigo,
    validadeAte: resultado.validadeAte,
    premio: resultado.premio,
  });
}
