import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Venda Acumulada é uma subcategoria do menu Metas (não tem moduleKey própria em
  // src/lib/permissions.ts), então usa a mesma chave "metas" (mesmo padrão do POST/DELETE abaixo).
  if (!(await hasModulePermission(session.user.id, "metas", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver a Venda Acumulada." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const entries = await prisma.waiterSaleEntry.findMany({
    where: { empresaId: { in: empresaIds } },
    include: { employee: { select: { id: true, name: true, cargo: true, photoUrl: true, empresaId: true } } },
    orderBy: { date: "desc" },
  });

  // Mesmo raciocínio do SSR (`src/app/portal/metas/acumulada/page.tsx`): a lista completa de
  // colaboradores ativos (com `id`) só serve pro dropdown de "Lançar venda" — só quem pode criar
  // de verdade (metas:canCreate, E em modo de loja única — o SSR usa
  // `ctx?.mode === "single" && canManageMetas`) precisa dela. Achado ALTO de auditoria (Jonas):
  // esta rota é chamada direto pelo client (`refresh()` em venda-acumulada-client.tsx) e podia ser
  // chamada por qualquer usuário com metas:canView (perfil "Funcionário" padrão já inclui isso),
  // então também precisa dessa checagem — não bastaria proteger só a página SSR. Revisão do Teulis
  // (achado "importante"): a checagem aqui tinha ficado incompleta (só repetia canCreate, sem o
  // `ctx.mode === "single"`), então em modo Grupo Nord esta rota ainda devolvia o roster completo
  // das duas lojas pra quem tivesse metas:canCreate — corrigido replicando a condição inteira.
  const canCreateEntry = ctx.mode === "single" && (await hasModulePermission(session.user.id, "metas", "canCreate"));
  const employees = canCreateEntry
    ? await prisma.employee.findMany({
        where: { empresaId: { in: empresaIds }, status: "ATIVO" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, cargo: true, photoUrl: true },
      })
    : [];

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee.name,
      employeePhoto: e.employee.photoUrl,
      amount: e.amount,
      date: e.date.toISOString(),
      note: e.note,
    })),
    employees,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Venda Acumulada é uma subcategoria do menu Metas (não tem moduleKey própria em
  // src/lib/permissions.ts), então usa a mesma chave "metas".
  if (!(await hasModulePermission(session.user.id, "metas", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar vendas acumuladas." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível lançar vendas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.employeeId || !body.amount) {
    return NextResponse.json({ error: "Informe o garçom e o valor vendido." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para esta loja." }, { status: 400 });
  }

  const entry = await prisma.waiterSaleEntry.create({
    data: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      amount: Number(body.amount) || 0,
      date: body.date ? new Date(body.date) : new Date(),
      note: body.note || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ entry });
}
