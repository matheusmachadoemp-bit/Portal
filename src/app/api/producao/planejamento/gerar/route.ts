import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { generateProductionPlan } from "@/lib/producao-plan-server";
import { PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";
import { hasModulePermission } from "@/lib/authz";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode gerar o plano de produção." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite gerar o plano de produção." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível gerar plano no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const targetDate = body.date ? new Date(body.date) : new Date();

  const result = await generateProductionPlan(empresa.id, targetDate, session.user.id);
  return NextResponse.json({ ok: true, ...result });
}
