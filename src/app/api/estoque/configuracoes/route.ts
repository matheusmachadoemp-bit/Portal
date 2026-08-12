import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para alterar esta configuração." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const metaCmvPercent = Number(body.metaCmvPercent);
  const metaDivergenciaContagemPercent = Number(body.metaDivergenciaContagemPercent);
  if (!Number.isFinite(metaCmvPercent) || metaCmvPercent <= 0 || metaCmvPercent >= 100) {
    return NextResponse.json({ error: "Informe uma meta de CMV válida entre 0 e 100." }, { status: 400 });
  }
  if (!Number.isFinite(metaDivergenciaContagemPercent) || metaDivergenciaContagemPercent < 0 || metaDivergenciaContagemPercent >= 100) {
    return NextResponse.json({ error: "Informe um limiar de divergência válido entre 0 e 100." }, { status: 400 });
  }

  await prisma.empresa.update({ where: { id: empresa.id }, data: { metaCmvPercent, metaDivergenciaContagemPercent } });

  return NextResponse.json({ metaCmvPercent, metaDivergenciaContagemPercent });
}
