import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      cargo: body.cargo ?? undefined,
      setor: body.setor ?? undefined,
      admissionDate: body.admissionDate ? new Date(body.admissionDate) : undefined,
      terminationDate: body.terminationDate ? new Date(body.terminationDate) : body.terminationDate === null ? null : undefined,
      status: body.status ?? undefined,
      phone: body.phone ?? undefined,
      email: body.email ?? undefined,
      gestorResponsavel: body.gestorResponsavel ?? undefined,
    },
  });

  return NextResponse.json({ employee });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
