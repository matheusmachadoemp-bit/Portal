import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await params;

  const certificate = await prisma.trainingCertificate.findUnique({
    where: { code: code.toUpperCase() },
    include: { user: { select: { name: true } }, course: { select: { name: true, instructor: true } } },
  });

  if (!certificate) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }

  return NextResponse.json({
    valid: true,
    certificate: {
      code: certificate.code,
      userName: certificate.user.name,
      courseName: certificate.course.name,
      instructor: certificate.course.instructor,
      cargaHoraria: certificate.cargaHoraria,
      issuedAt: certificate.issuedAt.toISOString(),
    },
  });
}
