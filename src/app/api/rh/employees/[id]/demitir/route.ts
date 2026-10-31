import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spStartOfDay } from "@/lib/timezone";

// Demitir é mais sensível que o PATCH genérico de colaborador (`../route.ts`, aberto a todo
// MANAGER_ROLES = ADMINISTRADOR/GESTOR/GERENTE/SUPERVISOR): a pessoa sai de verdade do "quadro de
// ativos" (some das listagens/contadores que filtram `status: "ATIVO"` — Escala de Folgas, Venda
// Acumulada, Metas, Pesquisa de Satisfação, Contagem de Estoque, e dos selects de "escolher
// colaborador" de Ponto Eletrônico/Ocorrências/Férias/Uniformes/Documentos/Financeiro). Por isso
// fica restrita a ADMINISTRADOR/GESTOR — mesmo nível já usado para outras ações sensíveis do
// sistema (Cofre de Senhas, cadastro de Usuários, integrações — ver `["ADMINISTRADOR", "GESTOR"]`
// em `src/app/api/admin/vault/route.ts`, `src/app/api/usuarios/route.ts` etc.), mais restrita que
// GERENTE/SUPERVISOR, que continuam podendo editar o resto da ficha normalmente.
const DISMISS_ROLES = ["ADMINISTRADOR", "GESTOR"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!DISMISS_ROLES.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Demitir um colaborador é uma ação restrita a Administrador ou Gestor." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar colaboradores." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (!body.terminationDate || typeof body.terminationDate !== "string") {
    return NextResponse.json({ error: "Informe a data de desligamento." }, { status: 400 });
  }
  const terminationDate = spStartOfDay(body.terminationDate);
  if (Number.isNaN(terminationDate.getTime())) {
    return NextResponse.json({ error: "Data de desligamento inválida." }, { status: 400 });
  }
  if (terminationDate < existing.admissionDate) {
    return NextResponse.json(
      { error: "A data de desligamento não pode ser anterior à data de admissão." },
      { status: 400 }
    );
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: { status: "DESLIGADO", terminationDate },
  });

  // Nenhum dado relacionado é tocado (Ocorrências, Ponto, Férias, Financeiro, Escala de Folgas,
  // Uniformes, Documentos continuam intactos) — só o status/terminationDate deste registro. O
  // "antes/depois" aqui registra quem demitiu e quando (auditoria), reaproveitando o mesmo
  // `AuditLog` genérico já usado em Vendas/Financeiro/Marketing/Universidade (ver CLAUDE.md).
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: existing.empresaId,
      action: "DEMITIR",
      entityType: "Employee",
      entityId: id,
      before: JSON.stringify({ status: existing.status, terminationDate: existing.terminationDate }),
      after: JSON.stringify({ status: employee.status, terminationDate: employee.terminationDate }),
    },
  });

  return NextResponse.json({ employee });
}
