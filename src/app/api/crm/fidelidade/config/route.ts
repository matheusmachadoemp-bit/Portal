import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Upsert da LoyaltyConfig (uma linha por empresa) — na prática quase sempre já existe e o uso
  // real é ajustar um valor já configurado, por isso trata como canEdit (mesmo critério de
  // estoque/configuracoes).
  if (!(await hasModulePermission(session.user.id, "crm", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar a configuração de fidelidade." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) return NextResponse.json({ error: "Selecione uma loja específica." }, { status: 400 });

  const body = await req.json();
  const pontosPorReal = Number(body.pontosPorReal);
  if (!pontosPorReal || pontosPorReal <= 0) {
    return NextResponse.json({ error: "Informe um valor válido de pontos por real." }, { status: 400 });
  }

  const config = await prisma.loyaltyConfig.upsert({
    where: { empresaId: empresa.id },
    update: { pontosPorReal },
    create: { empresaId: empresa.id, pontosPorReal },
  });

  return NextResponse.json({ config });
}
