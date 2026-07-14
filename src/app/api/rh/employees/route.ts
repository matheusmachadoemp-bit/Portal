import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ employees });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const employee = await prisma.employee.create({
    data: {
      name: body.name,
      cargo: body.cargo,
      setor: body.setor,
      admissionDate: new Date(body.admissionDate),
      terminationDate: body.terminationDate ? new Date(body.terminationDate) : null,
      status: body.status || "ATIVO",
      phone: body.phone || null,
      email: body.email || null,
      gestorResponsavel: body.gestorResponsavel || null,
    },
  });

  return NextResponse.json({ employee });
}
