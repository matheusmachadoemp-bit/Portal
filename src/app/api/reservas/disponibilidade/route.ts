import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { parseDateKey } from "@/lib/timezone";
import { isValidHHMM } from "@/lib/reservas";
import { getAvailability } from "@/lib/reservas-disponibilidade";

/**
 * Consulta de disponibilidade (Etapa 2) — `GET /api/reservas/disponibilidade?data=AAAA-MM-DD&
 * ambienteId=...&pessoas=N[&horario=HH:mm]`. Autenticada + `canView` do módulo "reservas", mesmo
 * padrão das demais rotas de Reservas já publicadas (Etapa 1). A página PÚBLICA de reserva
 * (`/reservar/[empresaKey]`, Etapa 3) consome uma versão sem login desta mesma lógica, por uma
 * rota própria — esta aqui é usada de verdade em produção pela criação MANUAL de reserva
 * (tela administrativa, ver `reservas-client.tsx`), que precisa estar autenticada para checar a
 * disponibilidade antes de confirmar a reserva pelo atendente. Achado do Mylon na revisão geral
 * de Reservas (tarefa #190): o comentário antigo dizia que esta rota existia "só pra testar o
 * motor nesta etapa" — já desatualizado desde a Etapa 4.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para consultar disponibilidade." }, { status: 400 });
  }

  const url = new URL(req.url);
  const dateKey = parseDateKey(url.searchParams.get("data"));
  if (!dateKey) {
    return NextResponse.json({ error: "Informe uma data válida (AAAA-MM-DD) em `data`." }, { status: 400 });
  }
  const environmentId = url.searchParams.get("ambienteId");
  if (!environmentId) {
    return NextResponse.json({ error: "Informe o ambiente em `ambienteId`." }, { status: 400 });
  }
  const partySizeRaw = Number(url.searchParams.get("pessoas"));
  if (!Number.isInteger(partySizeRaw) || partySizeRaw <= 0) {
    return NextResponse.json({ error: "Informe a quantidade de pessoas em `pessoas` (inteiro maior que zero)." }, { status: 400 });
  }
  const timeParam = url.searchParams.get("horario");
  if (timeParam && !isValidHHMM(timeParam)) {
    return NextResponse.json({ error: "Horário inválido em `horario` (use HH:mm)." }, { status: 400 });
  }

  const result = await getAvailability({
    empresaId: empresa.id,
    environmentId,
    dateKey,
    partySize: partySizeRaw,
    time: timeParam ?? undefined,
  });

  return NextResponse.json(result);
}
