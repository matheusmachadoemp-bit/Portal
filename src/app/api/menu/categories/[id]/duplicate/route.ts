import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const original = await prisma.category.findUnique({
    where: { id },
    include: { subcategories: true },
  });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const maxOrder = await prisma.category.aggregate({ _max: { order: true } });

  const copy = await prisma.category.create({
    data: {
      key: `${original.key}-copy-${Date.now()}`,
      name: `${original.name} (cópia)`,
      icon: original.icon,
      color: original.color,
      order: (maxOrder._max.order ?? 0) + 1,
      contentType: original.contentType,
      isSystem: false,
      subcategories: {
        create: original.subcategories.map((s) => ({
          key: `${s.key}-copy-${Date.now()}`,
          name: s.name,
          icon: s.icon,
          color: s.color,
          order: s.order,
          isSystem: false,
        })),
      },
    },
  });

  return NextResponse.json({ category: copy });
}
