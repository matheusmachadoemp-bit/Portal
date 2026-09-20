import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// BUG-004b: mesma checagem de cargo já usada nas rotas irmãs de RH (`/api/rh/employees`,
// `/api/rh/finance`, desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (financeiro:canView=true de fábrica) conseguia chamar este GET
// direto (fora da tela, que já foi corrigida no BUG-004) e listar as contas bancárias da empresa.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Financeiro." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const accounts = await prisma.bankAccount.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar contas bancárias." },
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

  const account = await prisma.bankAccount.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      bank: body.bank || null,
      agencia: body.agencia || null,
      conta: body.conta || null,
      tipo: body.tipo || "Conta Corrente",
      saldoInicial: Number(body.saldoInicial) || 0,
      saldoAtual: Number(body.saldoInicial) || 0,
      color: body.color || "#2952E3",
      icon: body.icon || "Landmark",
    },
  });

  return NextResponse.json({ account });
}
