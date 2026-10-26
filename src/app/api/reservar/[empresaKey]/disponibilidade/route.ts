import { NextResponse } from "next/server";
import { parseDateKey } from "@/lib/timezone";
import { isPositiveInt } from "@/lib/reservas";
import { getAvailability, getMonthAvailability } from "@/lib/reservas-disponibilidade";
import { checkReservarConsultaRateLimit, resolveEmpresaByKey } from "@/lib/reservas-publico";

const MES_PATTERN = /^(\d{4})-(\d{2})$/;

/**
 * Consulta PÚBLICA de disponibilidade (Etapa 3, sem sessão) — `GET /api/reservar/[empresaKey]/
 * disponibilidade?ambienteId=...&pessoas=N&(mes=AAAA-MM | data=AAAA-MM-DD)`. Reaproveita o mesmo
 * motor (`getAvailability`/`getMonthAvailability`, src/lib/reservas-disponibilidade.ts) usado pela
 * rota autenticada `GET /api/reservas/disponibilidade` — nenhuma lógica de disponibilidade
 * duplicada aqui, só a resolução pública da loja (por `empresaKey`, não por sessão) e rate limit.
 *
 * `mes` devolve um resumo (status por dia, para colorir o calendário); `data` devolve a grade de
 * horários completa de um único dia (mesmo formato de `AvailabilityResult` da rota autenticada).
 * Exatamente um dos dois deve ser informado.
 */
export async function GET(req: Request, { params }: { params: Promise<{ empresaKey: string }> }) {
  const { empresaKey } = await params;

  const allowed = await checkReservarConsultaRateLimit(req.headers, empresaKey);
  if (!allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." }, { status: 429 });
  }

  const empresa = await resolveEmpresaByKey(empresaKey);
  if (!empresa || !empresa.active) {
    return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
  }

  const url = new URL(req.url);
  const environmentId = url.searchParams.get("ambienteId");
  if (!environmentId) {
    return NextResponse.json({ error: "Informe o ambiente em `ambienteId`." }, { status: 400 });
  }
  const partySize = Number(url.searchParams.get("pessoas"));
  if (!isPositiveInt(partySize)) {
    return NextResponse.json({ error: "Informe a quantidade de pessoas em `pessoas` (inteiro maior que zero)." }, { status: 400 });
  }

  const dataParam = url.searchParams.get("data");
  const mesParam = url.searchParams.get("mes");

  // Envolvido num try/catch genérico pelo mesmo motivo do `POST .../reservas` (ver comentário lá):
  // é uma rota pública que consulta o banco sob concorrência real, e um erro inesperado (o Teulis
  // reproduziu um 500 cru vindo de dentro de `getAvailability`/`getActiveCombinations` sob 5
  // requisições simultâneas) nunca pode vazar corpo/stack cru pro cliente.
  try {
    if (dataParam) {
      const dateKey = parseDateKey(dataParam);
      if (!dateKey) {
        return NextResponse.json({ error: "Data inválida em `data` (use AAAA-MM-DD)." }, { status: 400 });
      }
      const result = await getAvailability({ empresaId: empresa.id, environmentId, dateKey, partySize });
      return NextResponse.json(result);
    }

    if (mesParam) {
      const match = MES_PATTERN.exec(mesParam);
      const year = match ? Number(match[1]) : NaN;
      const month = match ? Number(match[2]) : NaN;
      if (!match || month < 1 || month > 12) {
        return NextResponse.json({ error: "Mês inválido em `mes` (use AAAA-MM)." }, { status: 400 });
      }
      const result = await getMonthAvailability({ empresaId: empresa.id, environmentId, partySize, year, month });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Informe `data` (AAAA-MM-DD) ou `mes` (AAAA-MM)." }, { status: 400 });
  } catch (err) {
    console.error("[GET /api/reservar/[empresaKey]/disponibilidade] erro inesperado:", err);
    return NextResponse.json({ error: "Não foi possível consultar a disponibilidade, tente novamente." }, { status: 500 });
  }
}
