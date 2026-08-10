import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  EMPRESA_COOKIE,
  GRUPO_SENTINEL,
  getUserEmpresas,
  userCanViewGrupoNord,
} from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [empresas, dbUser] = await Promise.all([
    getUserEmpresas(session.user.id, session.user.role),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { canViewGrupoNord: true },
    }),
  ]);
  const canViewGrupoNord = await userCanViewGrupoNord(
    session.user.id,
    session.user.role,
    dbUser?.canViewGrupoNord ?? false
  );

  return NextResponse.json({ empresas, canViewGrupoNord });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const empresaId = String(body.empresaId ?? "");

  if (empresaId === GRUPO_SENTINEL) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { canViewGrupoNord: true },
    });
    const canViewGrupoNord = await userCanViewGrupoNord(
      session.user.id,
      session.user.role,
      dbUser?.canViewGrupoNord ?? false
    );
    if (!canViewGrupoNord) {
      return NextResponse.json({ error: "Sem permissão para o Grupo Nord." }, { status: 403 });
    }
  } else {
    const empresas = await getUserEmpresas(session.user.id, session.user.role);
    if (!empresas.some((e) => e.id === empresaId)) {
      return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(EMPRESA_COOKIE, empresaId, {
    path: "/",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
