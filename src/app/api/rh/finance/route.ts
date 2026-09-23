import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { computeFinanceMonthlyChart, computeFinanceTotals } from "@/lib/rh-server";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o RH." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");

  // Task #309: este GET nunca teve `take`, nem no caso filtrado por employeeId (chamado pelo
  // refresh() da ficha do colaborador, .../colaboradores/[id]/page.tsx, via FinanceiroClient com
  // fixedEmployeeId) nem no caso sem filtro (chamado pelo refresh() da página standalone
  // .../rh/financeiro/page.tsx). Isso já era uma inconsistência mesmo antes desta task: a ficha
  // aplica take:FINANCE_ENTRIES_SAFETY_TAKE=2000 na carga inicial via SSR, mas o refresh() batia
  // nesta rota sem teto nenhum — na prática inofensivo (nenhum colaborador chega perto de 2000
  // lançamentos, ver conta em colaboradores/[id]/page.tsx), mas incorreto por princípio (achado do
  // Teulis na revisão do #287, corrigido só agora).
  //
  // Os dois valores abaixo replicam os das páginas SSR irmãs (mesma conta de colaboradores/loja
  // documentada em ambas): 2000 pro caso filtrado por 1 colaborador
  // (colaboradores/[id]/page.tsx), 5000 pro caso sem filtro — todos os colaboradores da loja/Grupo
  // Nord (../../../portal/rh/financeiro/page.tsx).
  const FINANCE_ENTRIES_INDIVIDUAL_TAKE = 2000;
  const FINANCE_ENTRIES_STORE_TAKE = 5000;

  const empresaIds = empresaIdsForContext(ctx);
  const where = {
    empresaId: { in: empresaIds },
    ...(employeeId ? { employeeId } : {}),
  };

  // Task #309 revisão (Teulis): `totals`/`chartData` alimentam os StatCards e o gráfico do
  // FinanceiroClient (tanto standalone quanto na ficha do colaborador) — precisam vir de agregação
  // no banco (sem `take`), nunca de somar a lista `entries` acima (que tem `take`). Ver racional
  // completo em src/lib/rh-server.ts. Usam o MESMO `where` de `entries` (então já respeitam o
  // filtro por employeeId quando presente), só sem o `take`.
  const [entries, totals, chartData] = await Promise.all([
    prisma.employeeFinanceEntry.findMany({
      where,
      orderBy: { date: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
      take: employeeId ? FINANCE_ENTRIES_INDIVIDUAL_TAKE : FINANCE_ENTRIES_STORE_TAKE,
    }),
    computeFinanceTotals(where),
    computeFinanceMonthlyChart(empresaIds, employeeId),
  ]);
  return NextResponse.json({ entries, totals, chartData });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar lançamentos financeiros de colaboradores." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
  }

  const entry = await prisma.employeeFinanceEntry.create({
    data: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      date: new Date(body.date),
      description: body.description,
      type: body.type,
      value: Number(body.value) || 0,
      observacao: body.observacao || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ entry });
}
