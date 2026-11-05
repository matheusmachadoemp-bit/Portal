import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { slugify } from "@/lib/escala-folgas";

/**
 * Catálogo de tipos de evento da Escala de Folgas e Eventos (`EventType`) — GLOBAL (sem loja),
 * mesmo racional de `DayOffType` (ver comentário "Escala de Folgas E EVENTOS (expansão)" no bloco
 * "RH — ESCALA DE FOLGAS" em `prisma/schema.prisma`). Diferente de `DayOffType`, não existe aqui
 * `kind`/`isSystem`: todo `EventType` sempre gera só `CalendarEvent` (sem o conceito de "tipo
 * reservado que redireciona pra outra tabela").
 *
 * Mesma checagem de cargo (MANAGER_ROLES) já aplicada em todo o resto do módulo (BUG-004, achado
 * da auditoria do Jonas) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
 * "Funcionário" (rh:canView/canCreate=true de fábrica) conseguia ver/cadastrar tipos de evento do
 * catálogo global.
 */
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const eventTypes = await prisma.eventType.findMany({
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }],
  });
  return NextResponse.json({ eventTypes });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar tipos de evento." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ error: "Informe o nome do tipo de evento." }, { status: 400 });

  const key = slugify(nome);
  if (!key) return NextResponse.json({ error: "Informe um nome válido para o tipo de evento." }, { status: 400 });

  const existing = await prisma.eventType.findUnique({ where: { key } });
  if (existing) {
    return NextResponse.json({ error: `Já existe um tipo de evento chamado "${existing.nome}".` }, { status: 409 });
  }

  const eventType = await prisma.eventType.create({
    data: {
      key,
      nome,
      cor: typeof body?.cor === "string" && body.cor ? body.cor : "#2952E3",
      ordem: Number.isFinite(Number(body?.ordem)) ? Number(body.ordem) : 0,
    },
  });
  return NextResponse.json({ eventType }, { status: 201 });
}
