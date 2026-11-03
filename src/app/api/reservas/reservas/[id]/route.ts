import { NextResponse } from "next/server";
import type { ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_STATUS_TRANSITIONS, RESERVATION_STATUSES } from "@/lib/reservas";
import { storedDayKey } from "@/lib/timezone";
import { spHours, spMinutes } from "@/lib/checklist";
import { sendReservationAcceptedEmail, sendReservationCancelledEmail, type ReservationEmailDetails } from "@/lib/email";

const STATUSES = RESERVATION_STATUSES as ReservationStatus[];

const RESERVATION_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  environment: { select: { id: true, name: true } },
  cliente: { select: { id: true, nome: true } },
};

/** Monta os detalhes formatados (BR/São Paulo) usados nos e-mails de notificação ao cliente (ver
 * `notifyCustomerOfStatusChange` abaixo) a partir de uma reserva já carregada com
 * `RESERVATION_INCLUDE`. Formata data/hora com `storedDayKey`/`spHours`/`spMinutes` (nunca
 * `.getHours()`/`.toISOString()` puros) pelo mesmo motivo de sempre: o servidor roda em UTC, e
 * ler a hora "crua" do `Date` daria um horário errado pro cliente (mesma causa raiz documentada
 * em `src/lib/checklist.ts`). */
function buildReservationEmailDetails(r: {
  date: Date;
  startTime: Date;
  partySize: number;
  customerName: string | null;
  cliente: { nome: string } | null;
  empresa: { name: string };
  environment: { name: string };
}): ReservationEmailDetails {
  const dateKey = storedDayKey(r.date);
  const [year, month, day] = dateKey.split("-");
  return {
    customerName: r.customerName ?? r.cliente?.nome ?? "cliente",
    empresaName: r.empresa.name,
    environmentName: r.environment.name,
    dateBR: `${day}/${month}/${year}`,
    timeHHMM: `${String(spHours(r.startTime)).padStart(2, "0")}:${String(spMinutes(r.startTime)).padStart(2, "0")}`,
    partySize: r.partySize,
  };
}

/**
 * Notifica o cliente por e-mail quando a loja aprova/recusa a solicitação inicial de reserva, ou
 * cancela uma reserva já confirmada (ver prompt da tarefa "reservas-unificar-calendario", item
 * #5 — fluxo de negócio confirmado pelo Matheus: cliente manda solicitação PENDENTE -> loja
 * confere vaga -> aprova CONFIRMADA ou recusa CANCELADA):
 * - PENDENTE -> CONFIRMADA: e-mail de aprovação.
 * - PENDENTE -> CANCELADA: e-mail de recusa (caso principal pedido).
 * - CONFIRMADA -> CANCELADA: e-mail de cancelamento de reserva já confirmada — extensão de bom
 *   senso (não é o caso principal pedido, mas quem já tinha recebido confirmação merece saber
 *   que ela foi cancelada pela loja); texto próprio (`wasConfirmed: true`), nunca o mesmo texto
 *   de "recusa de solicitação". Não estendido a outras origens de CANCELADA (ex.
 *   CLIENTE_CHEGOU -> CANCELADA): esse caminho é raro na prática (cliente já chegou ao
 *   estabelecimento) e normalmente é tratado como NAO_COMPARECEU, não CANCELADA — fora de
 *   escopo desta tarefa.
 *
 * Nunca lança: a mudança de status já foi persistida no banco e é o dado principal da
 * requisição — uma falha no envio do e-mail (ex. Resend fora do ar/chave inválida) não deve
 * derrubar nem reverter essa resposta, só fica logada pra investigação.
 */
async function notifyCustomerOfStatusChange(
  previousStatus: string,
  newStatus: string,
  reservation: Parameters<typeof buildReservationEmailDetails>[0] & { id: string; customerEmail: string | null }
): Promise<void> {
  if (!reservation.customerEmail) return; // reserva antiga, criada antes do e-mail ser obrigatório — ver schema.prisma
  try {
    const details = buildReservationEmailDetails(reservation);
    if (previousStatus === "PENDENTE" && newStatus === "CONFIRMADA") {
      await sendReservationAcceptedEmail(reservation.customerEmail, details);
    } else if (newStatus === "CANCELADA" && (previousStatus === "PENDENTE" || previousStatus === "CONFIRMADA")) {
      await sendReservationCancelledEmail(reservation.customerEmail, { ...details, wasConfirmed: previousStatus === "CONFIRMADA" });
    }
  } catch (err) {
    console.error(`[PATCH /api/reservas/reservas/${reservation.id}] falha ao enviar e-mail de notificação:`, err);
  }
}

function serialize(r: Awaited<ReturnType<typeof loadOwnedReservation>>) {
  if (!r) return null;
  return {
    id: r.id,
    confirmationCode: r.confirmationCode,
    date: r.date.toISOString(),
    startTime: r.startTime.toISOString(),
    endTime: r.endTime.toISOString(),
    partySize: r.partySize,
    status: r.status,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    cliente: r.cliente,
    empresa: r.empresa,
    environment: r.environment,
  };
}

async function loadOwnedReservation(id: string, empresaId: string) {
  const reservation = await prisma.reservation.findUnique({ where: { id }, include: RESERVATION_INCLUDE });
  if (!reservation || reservation.empresaId !== empresaId) return null;
  return reservation;
}

/**
 * Muda o status de uma reserva (Etapa 4 — tela "Reservas"). Nunca edita data/horário — ajustar
 * esses dados é fora de escopo desta etapa (a reserva precisaria passar pelo motor de
 * disponibilidade de novo para não criar conflito; por ora, reagendar significa cancelar e criar
 * outra).
 *
 * Mesmo padrão de dupla trava de `src/app/api/reservas/ambientes/[id]/route.ts` (cargo +
 * permissão de módulo) e mesmo padrão de empresa única ativa (sem Grupo Nord) dos outros `PATCH`
 * de Reservas.
 *
 * Libera a capacidade ocupada pela reserva automaticamente ao mudar para um status terminal
 * (CANCELADA/NAO_COMPARECEU/FINALIZADA): o motor de disponibilidade
 * (`RESERVATION_OCCUPYING_STATUSES`, `src/lib/reservas-disponibilidade.ts`) já considera só os
 * status PENDENTE/CONFIRMADA/CLIENTE_CHEGOU/ACOMODADO como "ocupando" capacidade do ambiente —
 * mudar o status já é suficiente para essa capacidade voltar a aparecer livre pro motor.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite alterar reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar uma reserva." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await loadOwnedReservation(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (typeof status !== "string" || !STATUSES.includes(status as ReservationStatus)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  const allowed = RESERVATION_STATUS_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Não é possível mudar de "${existing.status}" para "${status}".` },
      { status: 400 }
    );
  }

  // Lock otimista: a leitura de `existing` (em `loadOwnedReservation`, acima) e esta escrita não
  // estão na mesma transação, então duas requisições PATCH concorrentes na mesma reserva (ex. um
  // atendente confirmando, outro cancelando quase ao mesmo tempo) podem as duas passar a
  // validação de `RESERVATION_STATUS_TRANSITIONS` acima — sem essa trava, as duas escreveriam com
  // sucesso e quem escrevesse por último "venceria" silenciosamente no banco, mas a resposta HTTP
  // de quem perdeu ainda mostraria sucesso com o status que ela pediu (e dispararia o e-mail de
  // notificação errado). `updateMany` com `status: existing.status` na cláusula `where` só
  // atualiza a linha se o status ainda for o mesmo que foi lido; `count === 0` significa que outra
  // requisição já mudou o status entre a leitura e esta escrita.
  const { count } = await prisma.reservation.updateMany({
    where: { id, status: existing.status },
    data: { status: status as ReservationStatus },
  });
  if (count === 0) {
    return NextResponse.json(
      { error: "Esta reserva foi alterada por outra ação enquanto você revisava. Recarregue a página e tente de novo." },
      { status: 409 }
    );
  }

  const updated = await prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: RESERVATION_INCLUDE,
  });

  // Notifica o cliente por e-mail (ver `notifyCustomerOfStatusChange` acima) — depois do UPDATE já
  // confirmado no banco, nunca antes: a mudança de status é o dado principal e já está
  // persistida neste ponto, então uma falha de envio (capturada e só logada dentro da própria
  // função, nunca lançada) não pode impedir nem reverter essa resposta. `await` de propósito, em
  // vez de "fire and forget": esta rota roda como função serverless (Vercel, ver
  // `scripts/migrate-deploy.sh`), que pode congelar/matar o processo assim que a resposta HTTP é
  // enviada — uma Promise disparada sem esperar correria o risco de nunca terminar de verdade
  // (nem o e-mail seria enviado, nem o log de erro rodaria). O pequeno custo de latência aqui é
  // aceitável: é uma ação administrativa pontual (clique num botão), não um caminho de alto
  // volume.
  await notifyCustomerOfStatusChange(existing.status, status, updated);

  return NextResponse.json({ reservation: serialize(updated) });
}
