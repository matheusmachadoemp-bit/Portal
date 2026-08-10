import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
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
