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
  if (!body.category) return NextResponse.json({ error: "Categoria não informada." }, { status: 400 });

  const config = await prisma.categoryQualityConfig.upsert({
    where: { empresaId_category: { empresaId: empresa.id, category: body.category } },
    update: {
      cmvMaximoPercent: body.cmvMaximoPercent !== undefined ? Number(body.cmvMaximoPercent) : undefined,
      diasDesatualizada: body.diasDesatualizada !== undefined ? Number(body.diasDesatualizada) : undefined,
    },
    create: {
      empresaId: empresa.id,
      category: body.category,
      cmvMaximoPercent: body.cmvMaximoPercent !== undefined ? Number(body.cmvMaximoPercent) : 35,
      diasDesatualizada: body.diasDesatualizada !== undefined ? Number(body.diasDesatualizada) : 90,
    },
  });

  return NextResponse.json({ config });
}
