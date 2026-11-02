// Reservas — Etapa 4 (telas administrativas "Clientes"/"Relatórios"). Este arquivo é novo e
// isolado de propósito — não reaproveita/edita `src/lib/reservas.ts` (compartilhado com as
// rotas de Visão Geral/Calendário/Fila de Espera, em desenvolvimento em paralelo por outros
// agentes nesta mesma etapa) para não arriscar um conflito de merge num arquivo que outra
// branch também pode estar tocando ao mesmo tempo. Só LÊ `Reservation`/`Cliente` — nenhuma
// mudança de schema nos dois models.

import { prisma } from "@/lib/prisma";
import { onlyDigits } from "@/lib/reservas";

/** Uma reserva do histórico de um cliente agregado (ver `ClienteReservasSummary` abaixo). */
export type ClienteReservaHistoryItem = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: string;
  environmentName: string;
};

/**
 * Cliente agregado a partir de `Reservation` (tela "Clientes" do módulo Reservas). Agrupamento
 * por `clienteId` quando a reserva já está cross-referenciada a um `Cliente` formal do CRM (ver
 * comentário em `Cliente.reservations`, `prisma/schema.prisma`); quando não há `Cliente`
 * vinculado, agrupa pelos dígitos de `customerPhone` — mesmo contato, reservas diferentes, sem
 * precisar de cadastro formal no CRM. Como fallback só para o caso raro de reserva sem nenhum
 * telefone, cada uma vira seu próprio grupo (pela própria `id`), para nunca juntar dois clientes
 * anônimos diferentes no mesmo cartão por engano.
 */
export type ClienteReservasSummary = {
  /** Chave de agrupamento (`cliente:<id>`, `tel:<dígitos>` ou `res:<reservationId>`) — só uso
   * interno da tela (React key / accordion), não é um id de banco. */
  key: string;
  clienteId: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  totalReservas: number;
  noShowCount: number;
  canceladaCount: number;
  /** ISO da reserva mais recente deste cliente (sempre preenchido — todo grupo tem ao menos 1
   * reserva, já que é isso que o gera). */
  ultimaReserva: string;
  /** Histórico completo, já ordenado da reserva mais recente para a mais antiga. */
  reservations: ClienteReservaHistoryItem[];
};

/**
 * Carrega e agrega TODAS as reservas de uma empresa em clientes únicos, numa única consulta ao
 * banco (sem N+1 — nunca uma query por cliente). A ordenação por `startTime` desc já entrega as
 * reservas de cada cliente da mais recente para a mais antiga, então a PRIMEIRA ocorrência de
 * cada chave de agrupamento já é a reserva mais recente daquele cliente — usada para o nome/
 * telefone/email "atuais" quando não há `Cliente` formal vinculado (o contato informado no
 * formulário público pode variar ligeiramente entre reservas, ex. apelido diferente). Quando há
 * `Cliente` vinculado, `cliente.nome`/`cliente.telefone` já são os mesmos em toda reserva do
 * grupo (mesmo clienteId), então não há diferença prática em usar sempre a primeira ocorrência.
 */
export async function loadClientesReservas(empresaId: string): Promise<ClienteReservasSummary[]> {
  const reservations = await prisma.reservation.findMany({
    where: { empresaId },
    select: {
      id: true,
      clienteId: true,
      cliente: { select: { nome: true, telefone: true } },
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      date: true,
      startTime: true,
      endTime: true,
      partySize: true,
      status: true,
      environment: { select: { name: true } },
    },
    orderBy: { startTime: "desc" },
  });

  const groups = new Map<string, ClienteReservasSummary>();

  for (const r of reservations) {
    const digits = r.customerPhone ? onlyDigits(r.customerPhone) : "";
    const key = r.clienteId ? `cliente:${r.clienteId}` : digits ? `tel:${digits}` : `res:${r.id}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        clienteId: r.clienteId,
        nome: r.cliente?.nome ?? r.customerName ?? "Sem nome",
        telefone: r.cliente?.telefone ?? r.customerPhone ?? null,
        email: r.customerEmail ?? null,
        totalReservas: 0,
        noShowCount: 0,
        canceladaCount: 0,
        ultimaReserva: r.startTime.toISOString(),
        reservations: [],
      };
      groups.set(key, group);
    }

    group.totalReservas += 1;
    if (r.status === "NAO_COMPARECEU") group.noShowCount += 1;
    if (r.status === "CANCELADA") group.canceladaCount += 1;
    group.reservations.push({
      id: r.id,
      date: r.date.toISOString(),
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      partySize: r.partySize,
      status: r.status,
      environmentName: r.environment.name,
    });
  }

  // Clientes mais frequentes primeiro (desempate pela reserva mais recente) — ajuda a destacar
  // quem é recorrente sem precisar de um controle de ordenação na tela nesta primeira versão.
  return Array.from(groups.values()).sort((a, b) => {
    if (b.totalReservas !== a.totalReservas) return b.totalReservas - a.totalReservas;
    return b.ultimaReserva.localeCompare(a.ultimaReserva);
  });
}
