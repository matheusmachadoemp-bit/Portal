import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "treinamentos";

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  // Mesmo padrão de src/app/api/university/courses/route.ts: curso "geral"
  // (sem empresa) ou da(s) empresa(s) que o usuário pode ver.
  const courseEmpresaFilter: Prisma.TrainingCourseWhereInput = {
    OR: [{ empresaId: null }, { empresaId: { in: empresaIds } }],
  };
  // Equivalente para colaboradores: só entra no ranking quem pertence à(s)
  // loja(s) do contexto ativo (por loja padrão ou por acesso extra), não
  // importa o cargo — cargo é de quem está exportando, não de quem aparece
  // no ranking.
  const userEmpresaFilter: Prisma.UserWhereInput = {
    OR: [
      { defaultEmpresaId: { in: empresaIds } },
      { empresaAccess: { some: { empresaId: { in: empresaIds } } } },
    ],
  };

  let csv = "";
  if (type === "treinamentos") {
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { course: courseEmpresaFilter },
      include: { user: { select: { name: true } }, course: { select: { name: true, cargaHoraria: true } } },
      orderBy: { updatedAt: "desc" },
    });
    csv = toCsv(
      enrollments.map((e) => ({
        colaborador: e.user.name,
        curso: e.course.name,
        status: e.status,
        progresso: `${e.progressPercent}%`,
        carga_horaria: e.course.cargaHoraria,
        iniciado_em: e.startedAt ? format(e.startedAt, "dd/MM/yyyy") : "",
        concluido_em: e.completedAt ? format(e.completedAt, "dd/MM/yyyy") : "",
      }))
    );
  } else if (type === "certificados") {
    const certificates = await prisma.trainingCertificate.findMany({
      where: { course: courseEmpresaFilter },
      include: { user: { select: { name: true } }, course: { select: { name: true } } },
      orderBy: { issuedAt: "desc" },
    });
    csv = toCsv(
      certificates.map((c) => ({
        codigo: c.code,
        colaborador: c.user.name,
        curso: c.course.name,
        carga_horaria: c.cargaHoraria,
        emitido_em: format(c.issuedAt, "dd/MM/yyyy"),
      }))
    );
  } else if (type === "ranking") {
    const xpEvents = await prisma.trainingXpEvent.groupBy({
      by: ["userId"],
      where: { user: userEmpresaFilter },
      _sum: { amount: true },
    });
    const users = await prisma.user.findMany({ where: { id: { in: xpEvents.map((x) => x.userId) } }, select: { id: true, name: true } });
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    csv = toCsv(
      xpEvents
        .map((x) => ({ colaborador: nameById.get(x.userId) ?? "", xp: x._sum.amount ?? 0 }))
        .sort((a, b) => b.xp - a.xp)
    );
  } else {
    return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="universidade-${type}.csv"`,
    },
  });
}
