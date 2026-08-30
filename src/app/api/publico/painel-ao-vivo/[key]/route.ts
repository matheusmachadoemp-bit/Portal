import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computePainelAoVivo } from "@/lib/painel-ao-vivo";

// Rota pública (sem login) usada pelo painel de TV/balcão. Não expõe nada
// além do que já aparece nesta tela: contagens/valores de pedidos do dia.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const empresa = await prisma.empresa.findUnique({
    where: { key },
    select: { id: true, active: true, name: true },
  });

  if (!empresa || !empresa.active) {
    return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
  }

  const payload = await computePainelAoVivo([empresa.id]);

  return NextResponse.json({ ...payload, empresaName: empresa.name });
}
