export type Status = "batida" | "abaixo" | "sem-dado";

export function statusOf(bateu: boolean | null): Status {
  return bateu === null ? "sem-dado" : bateu ? "batida" : "abaixo";
}
