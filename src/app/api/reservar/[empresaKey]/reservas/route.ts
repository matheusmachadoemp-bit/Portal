import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateKey } from "@/lib/timezone";
import { isPositiveInt, isValidHHMM, onlyDigits, isValidEmail } from "@/lib/reservas";
import {
  ReservationBusyError,
  ReservationConflictError,
  getAvailability,
  reserveTablesTransacted,
} from "@/lib/reservas-disponibilidade";
import { checkReservarCriarRateLimit, pickBestOption, resolveEmpresaByKey } from "@/lib/reservas-publico";

const NOME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 180;

/**
 * Cria a reserva de fato (Etapa 3, sem sessão) — `POST /api/reservar/[empresaKey]/reservas`.
 * Reaproveita o motor já existente: revalida a disponibilidade com `getAvailability` (a seleção
 * feita pelo cliente na tela pode ter ficado desatualizada entre a consulta e o envio do
 * formulário), escolhe a mesa/combinação com `pickBestOption` (o cliente nunca escolhe mesa
 * específica — ver `src/lib/reservas-publico.ts`) e grava com `reserveTablesTransacted`, que já
 * revalida de novo DENTRO da trava por ambiente (proteção real contra concorrência, aprovada na
 * revisão da Etapa 2). Nenhuma lógica de disponibilidade/concorrência duplicada aqui.
 */
export async function POST(req: Request, { params }: { params: Promise<{ empresaKey: string }> }) {
  const { empresaKey } = await params;

  const allowed = await checkReservarCriarRateLimit(req.headers, empresaKey);
  if (!allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos antes de tentar de novo." }, { status: 429 });
  }

  const empresa = await resolveEmpresaByKey(empresaKey);
  if (!empresa || !empresa.active) {
    return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);

  const environmentId = typeof body?.ambienteId === "string" && body.ambienteId ? body.ambienteId : null;
  if (!environmentId) {
    return NextResponse.json({ error: "Informe o ambiente." }, { status: 400 });
  }

  const dateKey = parseDateKey(body?.data);
  if (!dateKey) {
    return NextResponse.json({ error: "Informe uma data válida." }, { status: 400 });
  }

  if (!isValidHHMM(body?.horario)) {
    return NextResponse.json({ error: "Informe um horário válido." }, { status: 400 });
  }
  const horario: string = body.horario;

  const partySize = Number(body?.pessoas);
  if (!isPositiveInt(partySize)) {
    return NextResponse.json({ error: "Informe a quantidade de pessoas (inteiro maior que zero)." }, { status: 400 });
  }

  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
  if (nome.length > NOME_MAX_LENGTH) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });

  const telefone = onlyDigits(typeof body?.telefone === "string" ? body.telefone : "");
  if (telefone.length < 10 || telefone.length > 11) {
    return NextResponse.json({ error: "Informe um telefone válido, com DDD." }, { status: 400 });
  }

  const emailRaw = typeof body?.email === "string" ? body.email.trim() : "";
  if (emailRaw && (emailRaw.length > EMAIL_MAX_LENGTH || !isValidEmail(emailRaw))) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  // Tudo daqui pra baixo bate no banco (consulta de disponibilidade, cross-reference de Cliente,
  // criação da reserva) — envolvido num try/catch genérico de propósito: é uma rota PÚBLICA (sem
  // sessão) que escreve no banco, então um erro inesperado (ex.: falha transitória de conexão)
  // nunca pode vazar corpo/stack cru pro cliente (achado do Teulis na revisão desta etapa — ver
  // também o catch mais específico de `ReservationBusyError`/`ReservationConflictError` dentro
  // dele, que continua tratando os dois casos "esperados" com uma mensagem própria).
  try {
    // Revalida de verdade — a seleção feita na tela pode estar desatualizada (outra reserva pode
    // ter ocupado o horário enquanto o cliente preenchia os próprios dados).
    const availability = await getAvailability({ empresaId: empresa.id, environmentId, dateKey, partySize, time: horario });
    if (!availability.open) {
      return NextResponse.json({ error: "Esse dia não está mais disponível para reservas. Escolha outra data." }, { status: 409 });
    }
    const slot = availability.slots.find((s) => s.time === horario);
    if (!slot || !slot.available) {
      return NextResponse.json({ error: "Esse horário não está mais disponível. Escolha outro horário." }, { status: 409 });
    }
    const option = pickBestOption(slot.options, partySize);
    if (!option) {
      return NextResponse.json({ error: "Esse horário não está mais disponível. Escolha outro horário." }, { status: 409 });
    }

    // Cross-reference com um Cliente já cadastrado da loja pelo mesmo telefone — nunca cria um
    // Cliente novo a partir do fluxo público (ver comentário em `Reservation.customerName`/
    // `Cliente.reservations` no schema).
    const existingCliente = await prisma.cliente.findFirst({
      where: { empresaId: empresa.id, telefone },
      select: { id: true },
    });

    const reservation = await reserveTablesTransacted({
      empresaId: empresa.id,
      environmentId,
      tableIds: option.tableIds,
      dateKey,
      startTime: new Date(slot.startTime),
      endTime: new Date(slot.endTime),
      partySize,
      clienteId: existingCliente?.id ?? null,
      cleaningMinutes: availability.settings.cleaningMinutes,
      customerName: nome,
      customerPhone: telefone,
      customerEmail: emailRaw || null,
    });

    return NextResponse.json({
      reservation: {
        id: reservation.id,
        confirmationCode: reservation.confirmationCode,
        date: dateKey,
        time: horario,
        partySize,
      },
    });
  } catch (err) {
    if (err instanceof ReservationBusyError || err instanceof ReservationConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Qualquer outro erro (ex.: falha de conexão/driver com o banco) — nunca vaza detalhe interno
    // pra uma rota pública; fica logado no servidor para investigação.
    console.error("[POST /api/reservar/[empresaKey]/reservas] erro inesperado:", err);
    return NextResponse.json({ error: "Não foi possível completar sua reserva, tente novamente." }, { status: 500 });
  }
}
