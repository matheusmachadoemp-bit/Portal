import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { loadClientesReservas } from "@/lib/reservas-clientes";

/**
 * Clientes de Reservas (Etapa 4) — `GET /api/reservas/clientes`. Lista de clientes derivada de
 * `Reservation`, agregada numa única consulta (ver `loadClientesReservas`,
 * src/lib/reservas-clientes.ts) para nunca rodar uma query por cliente. Mesma permissão
 * ("reservas", canView) e mesmo requisito de loja única (sem suporte a "Grupo Nord" ainda) das
 * demais rotas do módulo já publicadas (Etapas 1-3) — ver `requireActiveSingleEmpresa`.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica para ver os clientes de Reservas." },
      { status: 400 }
    );
  }

  const clientes = await loadClientesReservas(empresa.id);
  return NextResponse.json({ clientes });
}
