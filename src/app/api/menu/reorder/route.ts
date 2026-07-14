import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// body: { type: "category", items: [{id, order}] }
//     | { type: "subcategory", items: [{id, order, categoryId}] }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { type, items } = body as {
    type: "category" | "subcategory";
    items: { id: string; order: number; categoryId?: string }[];
  };

  if (type === "category") {
    await prisma.$transaction(
      items.map((item) =>
        prisma.category.update({ where: { id: item.id }, data: { order: item.order } })
      )
    );
  } else {
    await prisma.$transaction(
      items.map((item) =>
        prisma.subcategory.update({
          where: { id: item.id },
          data: {
            order: item.order,
            ...(item.categoryId ? { categoryId: item.categoryId } : {}),
          },
        })
      )
    );
  }

  return NextResponse.json({ ok: true });
}
