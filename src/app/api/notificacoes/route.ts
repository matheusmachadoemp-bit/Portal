import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { goal: { select: { category: true } } },
    }),
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
  ]);

  const dto = notifications.map((n) => ({ ...n, goalCategory: n.goal?.category ?? null, goal: undefined }));

  return NextResponse.json({ notifications: dto, unreadCount });
}
