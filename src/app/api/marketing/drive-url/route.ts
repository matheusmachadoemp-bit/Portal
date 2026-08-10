import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica para configurar o Drive." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const updated = await prisma.empresa.update({
    where: { id: empresa.id },
    data: { driveFolderUrl: body.driveFolderUrl || null },
  });

  return NextResponse.json({ empresa: updated });
}
