import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { encryptSecret } from "@/lib/vault";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para acessar os cursos." },
      { status: 403 }
    );
  }
  const courses = await prisma.course.findMany({ orderBy: { createdAt: "desc" } });
  // Nunca devolve senhaCipher pra listagem (nem cru, nem decifrado) — só um
  // indicador booleano de que existe senha cadastrada. Ver senha de verdade
  // é só pela rota dedicada GET /api/admin/courses/[id]/senha.
  const sanitized = courses.map(({ senhaCipher, ...course }) => ({
    ...course,
    hasSenha: !!senhaCipher,
  }));
  return NextResponse.json({ courses: sanitized });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para cadastrar cursos." },
      { status: 403 }
    );
  }
  const body = await req.json();

  const course = await prisma.course.create({
    data: {
      name: body.name,
      plataforma: body.plataforma || null,
      link: body.link || null,
      usuario: body.usuario || null,
      senhaCipher: body.senha ? encryptSecret(body.senha) : null,
      responsavel: body.responsavel || null,
      percentualConcluido: Number(body.percentualConcluido) || 0,
      startDate: body.startDate ? new Date(body.startDate) : null,
      prazo: body.prazo ? new Date(body.prazo) : null,
      certificadoUrl: body.certificadoUrl || null,
      observacoes: body.observacoes || null,
      createdById: session.user.id,
    },
  });

  // Mesmo cuidado do GET: não devolve senhaCipher na resposta (aqui já seria
  // o valor cifrado, não a senha em texto puro, mas não há motivo pra
  // expor esse campo pro front-end mesmo assim).
  const { senhaCipher, ...sanitizedCourse } = course;
  return NextResponse.json({ course: { ...sanitizedCourse, hasSenha: !!senhaCipher } });
}
