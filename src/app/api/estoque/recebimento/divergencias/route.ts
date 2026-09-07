import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const items = await prisma.receivingItem.findMany({
    where: {
      status: { in: ["DIVERGENCIA", "NAO_RECEBIDO"] },
      receiving: { empresaId: { in: empresaIds } },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
    include: {
      resolvidoPor: { select: { name: true } },
      receiving: {
        select: {
          id: true,
          dataFim: true,
          purchase: {
            select: {
              id: true,
              data: true,
              supplier: { select: { razaoSocial: true, nomeFantasia: true } },
            },
          },
        },
      },
      purchaseItem: {
        select: {
          quantidade: true,
          unidade: true,
          valorUnitario: true,
          ingredient: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({ items });
}
