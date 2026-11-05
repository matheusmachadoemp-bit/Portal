import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spStartOfDay } from "@/lib/checklist";
import { parseDateKeyInput } from "@/lib/escala-folgas";

const EVENT_INCLUDE = {
  eventType: { select: { id: true, key: true, nome: true, cor: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.CalendarEventInclude;

/**
 * Editar/excluir um evento (`CalendarEvent`) específico — mesmo padrão de
 * `/api/rh/escala-folgas/entries/[id]` (checagem de cargo + `assertEmpresaAccess` pra isolar por
 * loja), mas sem cobertura de setor nem restrição de Líder (Role SUPERVISOR): evento não pertence
 * a um setor nem a um colaborador, ver comentário em `POST /api/rh/escala-folgas/events`.
 */
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite editar eventos." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  let dateKey: string | undefined;
  if (typeof body?.date === "string") {
    const parsed = parseDateKeyInput(body.date);
    if (!parsed) return NextResponse.json({ error: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
    dateKey = parsed;
  }

  // `eventTypeId` só muda se o campo vier no corpo (distingue "não mandou" de "mandou null pra
  // desvincular") — mesma convenção de `observacao` abaixo.
  let eventTypeId: string | null | undefined;
  let eventTypeNome: string | null = null;
  if (body?.eventTypeId !== undefined) {
    eventTypeId = typeof body.eventTypeId === "string" && body.eventTypeId ? body.eventTypeId : null;
    if (eventTypeId) {
      const eventType = await prisma.eventType.findUnique({
        where: { id: eventTypeId },
        select: { nome: true, ativo: true },
      });
      if (!eventType) return NextResponse.json({ error: "Tipo de evento inválido." }, { status: 400 });
      // Mesma trava do POST: um evento NOVO (ou trocando pra outro tipo aqui) não pode apontar pra
      // um tipo desativado — eventos já ligados a um tipo que foi desativado DEPOIS continuam
      // existindo normalmente (não passam por aqui, pois não estão trocando `eventTypeId`).
      if (!eventType.ativo) return NextResponse.json({ error: "Tipo de evento inativo." }, { status: 400 });
      eventTypeNome = eventType.nome;
    }
  }

  let titulo: string | undefined;
  if (typeof body?.titulo === "string") {
    titulo = body.titulo.trim();
  }
  // Trocou de tipo e não mandou um texto próprio junto: adota o nome do novo tipo, mesma
  // conveniência do `POST /api/rh/escala-folgas/events`.
  if (!titulo && eventTypeId && eventTypeNome) {
    titulo = eventTypeNome;
  }
  if (titulo === "") {
    return NextResponse.json({ error: "Informe um título para o evento." }, { status: 400 });
  }

  const calendarEvent = await prisma.calendarEvent.update({
    where: { id },
    data: {
      date: dateKey ? spStartOfDay(dateKey) : undefined,
      eventTypeId,
      titulo,
      observacao: body?.observacao !== undefined ? (body.observacao ? String(body.observacao).trim() : null) : undefined,
    },
    include: EVENT_INCLUDE,
  });
  return NextResponse.json({ calendarEvent });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite excluir eventos." }, { status: 403 });
  }

  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
