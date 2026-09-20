import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spDateKey, spStartOfDay } from "@/lib/checklist";
import { evaluateSectorCoverage, resolveOwnSetor, resolveSchedulePeriod } from "@/lib/escala-folgas-server";
import { parseDateKeyInput } from "@/lib/escala-folgas";

const ENTRY_INCLUDE = {
  employee: { select: { id: true, name: true, setor: true, cargo: true, photoUrl: true } },
  dayOffType: { select: { id: true, key: true, nome: true, cor: true, kind: true } },
} satisfies Prisma.DayOffEntryInclude;

/** Líder (Role SUPERVISOR) só mexe em folga de colaborador do próprio setor (item 16). */
async function assertSetorAccessIfLider(userId: string, role: string, setor: string): Promise<boolean> {
  if (role !== "SUPERVISOR") return true;
  const ownSetor = await resolveOwnSetor(userId);
  return !!ownSetor && ownSetor === setor;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.dayOffEntry.findUnique({ where: { id }, include: { employee: true } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite editar folgas." }, { status: 403 });
  }
  if (!(await assertSetorAccessIfLider(session.user.id, session.user.role, existing.employee.setor))) {
    return NextResponse.json(
      { error: "Você só pode editar folgas de colaboradores do seu próprio setor." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  // `body.date`, quando enviado, já chega como "YYYY-MM-DD" pronto — usado direto como dateKey,
  // nunca reconvertido via `spDateKey(new Date(...))` (ver `parseDateKeyInput`: fazer isso subtrai
  // 3h de fuso de uma data que já não é um instante, e sempre volta 1 dia — achado da revisão do
  // Teulis). Quando `body.date` não é enviado (edição que não muda a data), `existing.date` SIM é
  // um instante de verdade (foi gravado como `spStartOfDay(dateKey)`) — `spDateKey` nele é o uso
  // correto, converte de volta pro dateKey original sem erro.
  let dateKey: string;
  if (typeof body?.date === "string") {
    const parsed = parseDateKeyInput(body.date);
    if (!parsed) return NextResponse.json({ error: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
    dateKey = parsed;
  } else {
    dateKey = spDateKey(existing.date);
  }
  const dayOffTypeId = typeof body?.dayOffTypeId === "string" ? body.dayOffTypeId : existing.dayOffTypeId;

  if (dayOffTypeId !== existing.dayOffTypeId) {
    const dayOffType = await prisma.dayOffType.findUnique({ where: { id: dayOffTypeId } });
    if (!dayOffType || !dayOffType.ativo || dayOffType.kind !== "FOLGA") {
      return NextResponse.json({ error: "Tipo de folga inválido." }, { status: 400 });
    }
  }

  // Nota (revisão do Teulis, não é bug): isto reavalia a cobertura do setor mesmo quando a edição
  // não muda nem a data nem o tipo (ex.: só troca a `observacao`) — nesses casos o resultado é
  // sempre o mesmo de antes (`dateKey`/`existing.employee.setor` não mudaram), então é trabalho
  // redundante, não incorreto. Dá pra pular a chamada quando `dateKey === spDateKey(existing.date)`
  // — não otimizei agora pra manter o fix desta rodada focado só nos 2 bugs de data.
  const coverage = await evaluateSectorCoverage({
    empresaId: existing.empresaId,
    setor: existing.employee.setor,
    employeeId: existing.employeeId,
    dateKey,
  });
  const confirmarApesarDoAviso = body?.confirmarApesarDoAviso === true;
  if (coverage?.insuficiente && !confirmarApesarDoAviso) {
    return NextResponse.json({ saved: false, coverage });
  }

  const schedulePeriod = await resolveSchedulePeriod(existing.empresaId, dateKey);

  // Nota pra Fase 3: quando `SchedulePeriod.status` já publicado, esta edição deve gravar uma
  // `ScheduleChangeLog` (colaborador, folga anterior, nova, quem alterou, motivo) em vez de só
  // sobrescrever — ainda não implementado aqui porque nenhum período pode estar PUBLICADA nesta
  // fase (o botão "Publicar escala" nasce na Fase 3).
  try {
    const dayOffEntry = await prisma.dayOffEntry.update({
      where: { id },
      data: {
        date: spStartOfDay(dateKey),
        dayOffTypeId,
        schedulePeriodId: schedulePeriod.id,
        observacao: body?.observacao !== undefined ? (body.observacao ? String(body.observacao).trim() : null) : undefined,
        autorizadoPorId: coverage?.insuficiente ? session.user.id : existing.autorizadoPorId,
        autorizadoEm: coverage?.insuficiente ? new Date() : existing.autorizadoEm,
      },
      include: ENTRY_INCLUDE,
    });
    return NextResponse.json({ dayOffEntry, saved: true, coverage });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Esse colaborador já tem uma folga cadastrada nesse dia." }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.dayOffEntry.findUnique({ where: { id }, include: { employee: true } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite excluir folgas." }, { status: 403 });
  }
  if (!(await assertSetorAccessIfLider(session.user.id, session.user.role, existing.employee.setor))) {
    return NextResponse.json(
      { error: "Você só pode excluir folgas de colaboradores do seu próprio setor." },
      { status: 403 }
    );
  }

  // Mesma nota da Fase 3 que o PATCH acima: cancelamento pós-publicação também vai precisar
  // gravar `ScheduleChangeLog` quando essa fase existir.
  await prisma.dayOffEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
