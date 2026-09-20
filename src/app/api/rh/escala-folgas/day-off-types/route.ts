import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

/**
 * Catálogo de tipos de folga da Escala de Folgas (`DayOffType`) — GLOBAL (sem loja), ver
 * comentário no bloco "RH — ESCALA DE FOLGAS" em `prisma/schema.prisma` para o porquê. Linhas com
 * `kind` FERIAS/AFASTAMENTO são reservadas (`isSystem = true`, nascem só pelo seed) e não podem
 * ser criadas por aqui — ao serem escolhidas no modal "Adicionar folga", a tela deve chamar
 * `/api/rh/vacations` ou `/api/rh/absences` em vez de `/api/rh/escala-folgas/entries` (ver
 * `POST /api/rh/escala-folgas/entries`, que rejeita essas 2 linhas com uma mensagem explicando
 * pra onde ir). Só linhas `kind: "FOLGA"` são administráveis por aqui.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const dayOffTypes = await prisma.dayOffType.findMany({
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }],
  });
  return NextResponse.json({ dayOffTypes });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar tipos de folga." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ error: "Informe o nome do tipo de folga." }, { status: 400 });

  const key = slugify(nome);
  if (!key) return NextResponse.json({ error: "Informe um nome válido para o tipo de folga." }, { status: 400 });

  const existing = await prisma.dayOffType.findUnique({ where: { key } });
  if (existing) {
    return NextResponse.json({ error: `Já existe um tipo de folga chamado "${existing.nome}".` }, { status: 409 });
  }

  const dayOffType = await prisma.dayOffType.create({
    data: {
      key,
      nome,
      // Só o seed cria linhas kind FERIAS/AFASTAMENTO (reservadas) — esta rota sempre cria FOLGA.
      kind: "FOLGA",
      cor: typeof body?.cor === "string" && body.cor ? body.cor : "#2952E3",
      ordem: Number.isFinite(Number(body?.ordem)) ? Number(body.ordem) : 0,
    },
  });
  return NextResponse.json({ dayOffType }, { status: 201 });
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
