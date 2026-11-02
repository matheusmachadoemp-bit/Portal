import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import { computeReservasReport } from "@/lib/reservas-relatorios";

/**
 * Relatórios de Reservas (Etapa 4) — `GET /api/reservas/relatorios?key=mes-atual[&from&to]`.
 * Agregação server-side sobre `Reservation` num período (mesmo filtro padrão de período do
 * portal — `STANDARD_PERIOD_OPTIONS`/`RollingPeriodKey`, ver src/lib/periods.ts — reaproveitado
 * em vez de reinventar o cálculo de janela de datas). Mesma permissão/requisito de loja única
 * das demais rotas do módulo — ver comentário equivalente em `GET /api/reservas/clientes`.
 *
 * Nome da rota não muda: a tela que consome esse endpoint se chamava "Relatórios"
 * (`/portal/reservas/relatorios`) e, a pedido do usuário, foi mesclada dentro de "Visão Geral"
 * (`/portal/reservas/visao-geral`, seção "Relatório por período" — ver
 * `RelatoriosPeriodoSection` em src/app/portal/reservas/visao-geral/relatorios-periodo-client.tsx
 * e prisma/migrations/20261102030000_remove_relatorios_subcategoria_reservas). Só agregação de
 * leitura, sem nenhuma outra tela dependendo do path — manter o nome da rota evita um
 * rename sem motivo funcional.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica para ver os relatórios de Reservas." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("key") ?? "mes-atual") as RollingPeriodKey;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const { from: periodFrom, to: periodTo } = resolveRollingPeriod(key, { from, to });

  const report = await computeReservasReport(empresa.id, periodFrom, periodTo);

  return NextResponse.json({
    periodFrom: periodFrom.toISOString(),
    periodTo: periodTo.toISOString(),
    ...report,
  });
}
