import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spStartOfDay } from "@/lib/checklist";
import { parseDateKeyInput } from "@/lib/escala-folgas";

const EVENT_INCLUDE = {
  eventType: { select: { id: true, key: true, nome: true, cor: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.CalendarEventInclude;

/**
 * Eventos da loja (`CalendarEvent`) — expansão "Escala de Folgas e Eventos" (ver comentário no
 * bloco "RH — ESCALA DE FOLGAS" em `prisma/schema.prisma`). Diferente de `DayOffEntry`, NÃO exige
 * colaborador nenhum: é algo da loja inteira (ex. "Aniversário Coletivo", "Dia da Massagem", ou
 * qualquer evento avulso digitado livre). Por isso não há restrição de setor nem de Líder
 * (Role SUPERVISOR) aqui — um evento não pertence a um setor, pertence à loja.
 *
 * Mesma checagem de cargo (MANAGER_ROLES) + `hasModulePermission("rh", ...)` já aplicada em todo o
 * resto do módulo (BUG-004, achado da auditoria do Jonas).
 *
 * Filtros de `GET` por query: `from`/`to` ("YYYY-MM-DD", opcionais) e `eventTypeId` (opcional).
 *
 * `POST` aceita `{ date: "YYYY-MM-DD", eventTypeId?: string, titulo?: string, observacao?: string }`.
 * Pelo menos um de `eventTypeId`/`titulo` é obrigatório: com `eventTypeId`, `titulo` nasce igual ao
 * `nome` do tipo escolhido quando o cliente não manda um texto próprio (permite o RH ajustar o
 * texto exibido sem precisar de um tipo novo pra isso, ex. "Aniversário Coletivo — Novembro"); sem
 * `eventTypeId`, `titulo` é texto livre obrigatório (evento avulso, sem tipo cadastrado).
 *
 * Editar/excluir um evento já criado: `PATCH`/`DELETE /api/rh/escala-folgas/events/[id]`.
 */
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const eventTypeId = searchParams.get("eventTypeId");
  const from = parseDateKeyInput(searchParams.get("from"));
  const to = parseDateKeyInput(searchParams.get("to"));

  const events = await prisma.calendarEvent.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(eventTypeId ? { eventTypeId } : {}),
      ...(from || to
        ? { date: { ...(from ? { gte: spStartOfDay(from) } : {}), ...(to ? { lte: spStartOfDay(to) } : {}) } }
        : {}),
    },
    orderBy: { date: "asc" },
    take: 1000,
    include: EVENT_INCLUDE,
  });
  return NextResponse.json({ events });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite cadastrar eventos." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const dateKey = parseDateKeyInput(body?.date);
  if (!dateKey) return NextResponse.json({ error: "Informe a data (AAAA-MM-DD) do evento." }, { status: 400 });

  const eventTypeId = typeof body?.eventTypeId === "string" && body.eventTypeId ? body.eventTypeId : null;
  const observacao = typeof body?.observacao === "string" ? body.observacao.trim() || null : null;
  let titulo = typeof body?.titulo === "string" ? body.titulo.trim() : "";

  let eventType: { id: string; nome: string; ativo: boolean } | null = null;
  if (eventTypeId) {
    eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      select: { id: true, nome: true, ativo: true },
    });
    if (!eventType) return NextResponse.json({ error: "Tipo de evento inválido." }, { status: 400 });
    // `ativo: false` não impede o seed/catálogo de continuar existindo pra eventos já criados
    // (igual `DayOffType`), mas um evento NOVO não pode nascer apontando pra um tipo desativado.
    if (!eventType.ativo) return NextResponse.json({ error: "Tipo de evento inativo." }, { status: 400 });
    if (!titulo) titulo = eventType.nome;
  }

  if (!titulo) {
    return NextResponse.json(
      { error: "Informe o título do evento ou selecione um tipo de evento cadastrado." },
      { status: 400 }
    );
  }

  const calendarEvent = await prisma.calendarEvent.create({
    data: {
      empresaId: empresa.id,
      date: spStartOfDay(dateKey),
      eventTypeId,
      titulo,
      observacao,
      createdById: session.user.id,
    },
    include: EVENT_INCLUDE,
  });
  return NextResponse.json({ calendarEvent }, { status: 201 });
}
