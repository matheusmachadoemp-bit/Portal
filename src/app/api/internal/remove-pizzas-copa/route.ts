import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// TEMPORARY, ONE-OFF ROUTE. Remove as "Pizzas da Copa" (ficha técnica
// promocional incompleta, importada da planilha de custeio e que o usuário
// pediu para deixar de fora do cardápio). Protegida por sessão
// ADMINISTRADOR/GESTOR, mesmo padrão de toda rota administrativa do
// projeto. Apague este arquivo depois de uma chamada bem-sucedida.
const NAMES = [
  "PIZZAS DA COPA - NILSON 1",
  "PIZZAS DA COPA - NILSON 2",
  "PIZZAS DA COPA - NILSON 3",
  "COPIZZAS DA COPA - MILLENE 1",
  "PIZZAS DA COPA - MILLENE 2",
  "PIZZAS DA COPA - EDUARDO 1",
  "PIZZAS DA COPA - EDUARDO 2",
  "PIZZAS DA COPA - EDUARDO 3",
  "PIZZAS DA COPA - LARYSSA",
  "PIZZAS DA COPA - FELIPE",
  "PIZZAS DA COPA -  KAUÃ",
  "PIZZAS DA COPA -  JOYCE",
];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const apply = searchParams.get("apply") === "1";

  const found = await prisma.product.findMany({
    where: { category: "PIZZA_SALGADA", name: { in: NAMES } },
    select: { id: true, name: true, code: true },
  });

  const removed: string[] = [];
  if (apply) {
    for (const p of found) {
      await prisma.productIngredient.deleteMany({ where: { productId: p.id } });
      await prisma.product.delete({ where: { id: p.id } });
      removed.push(p.name);
    }
  }

  return NextResponse.json({
    apply,
    encontrados: found.map((p) => ({ nome: p.name, code: p.code })),
    naoEncontrados: NAMES.filter((n) => !found.some((f) => f.name === n)),
    removidos: removed,
  });
}
