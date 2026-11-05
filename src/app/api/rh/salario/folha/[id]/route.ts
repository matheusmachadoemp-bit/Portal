import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/**
 * Quem pode aprovar/reprovar uma linha da Folha Salarial. Decisão final do usuário (depois de
 * revisão do Teulis): só `ADMINISTRADOR` — nem `GESTOR`, nem `GERENTE`, nem `SUPERVISOR`. Mais
 * restrito que o corte padrão de RH (`ADMINISTRADOR`/`GESTOR`/`GERENTE`/`SUPERVISOR`, usado por
 * `/api/rh/vacations`, `/api/rh/finance`, `/api/rh/employees` pra ver/criar/editar) porque aprovar
 * adicional noturno é uma decisão financeira sobre o salário de outro colaborador, não uma
 * atualização operacional do dia a dia (tipo lançar uma falta ou cadastrar férias).
 */
const APPROVER_ROLES = ["ADMINISTRADOR"];

const VALID_STATUSES = ["APROVADO", "REPROVADO"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!APPROVER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a quem pode aprovar a Folha Salarial." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar o RH." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const existing = await prisma.nightShiftAllowance.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const status = body?.status;
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'status deve ser "APROVADO" ou "REPROVADO".' }, { status: 400 });
  }

  // Agora que só ADMINISTRADOR chega até aqui (ver APPROVER_ROLES acima), esta checagem nunca
  // bloqueia de fato — mas fica mantida como segurança redundante (defesa em profundidade) caso
  // APPROVER_ROLES volte a incluir outro cargo no futuro: mesmo assim, só ADMINISTRADOR poderia
  // mudar uma linha que já tinha sido aprovada/reprovada antes.
  if (existing.status !== "PENDENTE" && session.user.role !== "ADMINISTRADOR") {
    return NextResponse.json(
      { error: "Esta linha já foi decidida. Só um Administrador pode alterá-la de novo." },
      { status: 400 }
    );
  }

  const allowance = await prisma.nightShiftAllowance.update({
    where: { id },
    data: {
      status,
      aprovadoPorId: session.user.id,
      aprovadoEm: new Date(),
    },
  });

  return NextResponse.json({ allowance });
}
