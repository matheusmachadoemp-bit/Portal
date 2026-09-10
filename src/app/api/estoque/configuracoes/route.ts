import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para alterar esta configuração." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações de estoque." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const data: { metaCmvPercent?: number; metaDivergenciaContagemPercent?: number } = {};

  if (body.metaCmvPercent !== undefined) {
    const metaCmvPercent = Number(body.metaCmvPercent);
    if (!Number.isFinite(metaCmvPercent) || metaCmvPercent <= 0 || metaCmvPercent >= 100) {
      return NextResponse.json({ error: "Informe uma meta de CMV válida entre 0 e 100." }, { status: 400 });
    }
    data.metaCmvPercent = metaCmvPercent;
  }

  if (body.metaDivergenciaContagemPercent !== undefined) {
    const metaDivergenciaContagemPercent = Number(body.metaDivergenciaContagemPercent);
    if (!Number.isFinite(metaDivergenciaContagemPercent) || metaDivergenciaContagemPercent < 0 || metaDivergenciaContagemPercent >= 100) {
      return NextResponse.json({ error: "Informe um limiar de divergência válido entre 0 e 100." }, { status: 400 });
    }
    data.metaDivergenciaContagemPercent = metaDivergenciaContagemPercent;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhuma configuração informada." }, { status: 400 });
  }

  await prisma.empresa.update({ where: { id: empresa.id }, data });

  return NextResponse.json(data);
}
