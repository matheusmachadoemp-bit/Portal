import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { parseDateKeyInput } from "@/lib/escala-folgas";
import { getCalendarioDias, resolveOwnSetor } from "@/lib/escala-folgas-server";

/**
 * Agregador de calendário da Escala de Folgas — junta as 4 fontes de indisponibilidade
 * (`DayOffEntry`, `Vacation`, `Absence`, `StoreClosedWeekday`) num resultado único por dia, com
 * nome/setor/cargo do colaborador e cor/nome do tipo já resolvidos. Pensado pra alimentar de uma
 * vez só o calendário mensal, a visão semanal e a visão por colaborador (Fase 2 de tela, Caio) —
 * sem N+1 de requisições. Ver `getCalendarioDias` (@/lib/escala-folgas-server) pra como as 4
 * fontes são combinadas e o racional completo (inclusive a mesma correção de fuso horário já
 * aplicada 3x nesta feature, reaproveitada aqui via `vacationOverlapsRangeWhere`/
 * `absenceOverlapsRangeWhere`).
 *
 * Query: `from`/`to` (obrigatórios, "YYYY-MM-DD", inclusive nos dois extremos; máximo de 366 dias
 * de intervalo) e `setor` (opcional).
 *
 * Líder (Role SUPERVISOR) só enxerga o próprio setor aqui — mesma restrição já aplicada em
 * `GET /api/rh/escala-folgas/entries` (item 16 do pedido original). `lojasFechadas` de cada dia
 * NUNCA é filtrado por setor (loja fechada é um fato da loja inteira, não de um setor).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = parseDateKeyInput(searchParams.get("from"));
  const to = parseDateKeyInput(searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json({ error: "Informe from e to no formato AAAA-MM-DD." }, { status: 400 });
  }

  let setor = searchParams.get("setor");
  if (session.user.role === "SUPERVISOR") {
    const ownSetor = await resolveOwnSetor(session.user.id);
    if (!ownSetor) return NextResponse.json({ from, to, dias: [] });
    setor = ownSetor;
  }

  const dias = await getCalendarioDias({ empresaIds: empresaIdsForContext(ctx), fromKey: from, toKey: to, setor });
  if (!dias) {
    return NextResponse.json(
      { error: "Intervalo inválido: verifique se from não é depois de to e se o período não passa de 366 dias." },
      { status: 400 }
    );
  }

  return NextResponse.json({ from, to, dias });
}
