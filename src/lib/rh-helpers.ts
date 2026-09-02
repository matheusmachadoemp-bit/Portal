import { differenceInDays, differenceInYears, differenceInMonths, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

/** Funções puras (client + server) para Ponto Eletrônico, Férias e Documentos do RH. */

export function timeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function computeHorasTrabalhadas(input: {
  entrada?: string | null;
  saidaAlmoco?: string | null;
  retornoAlmoco?: string | null;
  saida?: string | null;
}): number {
  const entrada = timeToMinutes(input.entrada);
  const saida = timeToMinutes(input.saida);
  if (entrada === null || saida === null || saida <= entrada) return 0;
  let totalMinutes = saida - entrada;
  const saidaAlmoco = timeToMinutes(input.saidaAlmoco);
  const retornoAlmoco = timeToMinutes(input.retornoAlmoco);
  if (saidaAlmoco !== null && retornoAlmoco !== null && retornoAlmoco > saidaAlmoco) {
    totalMinutes -= retornoAlmoco - saidaAlmoco;
  }
  return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100);
}

export function tempoDeEmpresa(admissionDate: Date | string, until: Date = new Date()): string {
  const start = new Date(admissionDate);
  const years = differenceInYears(until, start);
  const months = differenceInMonths(until, start) % 12;
  if (years <= 0 && months <= 0) return "menos de 1 mês";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ano${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} mês${months > 1 ? "es" : ""}`);
  return parts.join(" e ");
}

/**
 * Período aquisitivo de férias vigente pela CLT (art. 130): cada ciclo dura
 * 12 meses a partir da admissão (ou do fim do ciclo anterior), com direito a
 * 30 dias. Dado a data de admissão, devolve o ciclo de 12 meses em que o
 * colaborador está agora (o próximo a vencer).
 */
export function computeCurrentAquisitivePeriod(
  admissionDate: Date | string,
  now: Date = new Date()
): { inicio: Date; fim: Date; diasDireito: number } {
  const start = new Date(admissionDate);
  let inicio = new Date(start);
  let fim = new Date(start);
  fim.setFullYear(fim.getFullYear() + 1);
  while (fim <= now) {
    inicio = new Date(fim);
    fim = new Date(inicio);
    fim.setFullYear(fim.getFullYear() + 1);
  }
  return { inicio, fim, diasDireito: 30 };
}

export type TimeEntryLike = {
  date: string;
  entrada: string | null;
  saida: string | null;
  horasTrabalhadas: number;
  atrasoMinutos: number;
  falta: boolean;
};

const JORNADA_DIARIA_HORAS = 8;
const JORNADA_SEMANAL_HORAS = 44;

/** Alertas automáticos do Ponto Eletrônico, calculados a partir dos registros já carregados. */
export function pontoAlerts(entries: TimeEntryLike[]): string[] {
  const alerts: string[] = [];
  if (entries.length === 0) return alerts;

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const semanaAtual = entries.filter((e) => isWithinInterval(new Date(e.date), { start: weekStart, end: weekEnd }));

  const atrasosSemana = semanaAtual.filter((e) => e.atrasoMinutos > 0).length;
  if (atrasosSemana >= 3) {
    alerts.push(`Chegou atrasado ${atrasosSemana} vezes esta semana.`);
  }

  const bancoTotalMinutos = entries.reduce((sum, e) => sum + (e.horasTrabalhadas - JORNADA_DIARIA_HORAS) * 60, 0);
  if (bancoTotalMinutos <= -60) {
    alerts.push(`Possui banco de horas negativo (${Math.round(bancoTotalMinutos / 60)}h).`);
  } else if (bancoTotalMinutos >= 60) {
    alerts.push(`Possui banco de horas positivo (+${Math.round(bancoTotalMinutos / 60)}h).`);
  }

  const horasSemana = semanaAtual.reduce((sum, e) => sum + e.horasTrabalhadas, 0);
  if (horasSemana > JORNADA_SEMANAL_HORAS) {
    alerts.push(`Ultrapassou a carga semanal (${horasSemana.toFixed(1)}h de ${JORNADA_SEMANAL_HORAS}h).`);
  }

  const semSaida = entries.filter((e) => e.entrada && !e.saida);
  if (semSaida.length > 0) {
    alerts.push(`Não registrou saída em ${semSaida.length} dia${semSaida.length > 1 ? "s" : ""}.`);
  }

  return alerts;
}

export type VacationLike = {
  employeeId: string;
  employee: { name: string };
  periodoAquisitivoFim: string;
  dataInicio: string | null;
  dataFim: string | null;
  status: string;
};

/** Alertas de Férias: vencendo em até 60 dias, quem está de férias agora, solicitações pendentes. */
export function feriasAlerts(vacations: VacationLike[]): string[] {
  const alerts: string[] = [];
  const now = new Date();

  const vencendo = vacations.filter((v) => {
    if (v.status === "CONCLUIDA" || v.status === "CANCELADA") return false;
    const dias = differenceInDays(new Date(v.periodoAquisitivoFim), now);
    return dias >= 0 && dias <= 60;
  });
  if (vencendo.length > 0) {
    alerts.push(`${vencendo.length} colaborador${vencendo.length > 1 ? "es" : ""} com férias vencendo em até 60 dias.`);
  }

  const emFerias = vacations.filter((v) => v.status === "EM_ANDAMENTO");
  if (emFerias.length > 0) {
    alerts.push(`${emFerias.length} colaborador${emFerias.length > 1 ? "es" : ""} de férias agora.`);
  }

  const pendentes = vacations.filter((v) => v.status === "PLANEJADA");
  if (pendentes.length > 0) {
    alerts.push(`${pendentes.length} solicitação${pendentes.length > 1 ? "ões" : ""} de férias pendente${pendentes.length > 1 ? "s" : ""} de aprovação.`);
  }

  return alerts;
}

export type DocumentLike = {
  employee: { name: string };
  categoria: string;
  nome: string;
  validade: string | null;
};

export function documentStatus(validade: string | null): "valido" | "vencendo" | "vencido" | "sem-validade" {
  if (!validade) return "sem-validade";
  const dias = differenceInDays(new Date(validade), new Date());
  if (dias < 0) return "vencido";
  if (dias <= 30) return "vencendo";
  return "valido";
}

/** Alertas de Documentos: CNH/ASO vencendo, documento vencido, etc. */
export function documentosAlerts(documents: DocumentLike[]): string[] {
  const alerts: string[] = [];
  const vencendo = documents.filter((d) => documentStatus(d.validade) === "vencendo");
  const vencidos = documents.filter((d) => documentStatus(d.validade) === "vencido");

  const cnhVencendo = vencendo.filter((d) => d.categoria === "CNH");
  if (cnhVencendo.length > 0) {
    alerts.push(`${cnhVencendo.length} CNH vencendo nos próximos 30 dias.`);
  }
  const asoVencendo = vencendo.filter((d) => d.categoria === "ASO");
  if (asoVencendo.length > 0) {
    alerts.push(`${asoVencendo.length} ASO vencendo nos próximos 30 dias.`);
  }
  if (vencidos.length > 0) {
    alerts.push(`${vencidos.length} documento${vencidos.length > 1 ? "s" : ""} vencido${vencidos.length > 1 ? "s" : ""}.`);
  }

  return alerts;
}
