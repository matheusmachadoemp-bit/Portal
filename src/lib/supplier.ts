/**
 * Normaliza o campo `diasEntregaSemana` de `Supplier` (dias da semana em que o fornecedor
 * costuma entregar) vindo do body de criar/editar fornecedor (`src/app/api/estoque/fornecedores`).
 *
 * Vocabulário: 0 = domingo .. 6 = sábado — mesmo usado por `StoreClosedWeekday`/
 * `ProductionWeekdayWeight`/`spWeekday` (src/lib/checklist.ts). Aceita qualquer array, filtra só
 * os valores que são inteiros válidos entre 0 e 6, remove duplicados e ordena. Entrada
 * ausente/vazia/totalmente inválida vira lista vazia (fornecedor "sem dia de entrega definido"),
 * nunca lança erro — o form (multi-seleção de dias) só deve mandar valores já válidos, isto aqui
 * é só uma rede de segurança contra chamadas manuais/malformadas à API.
 */
export function parseDiasEntregaSemana(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const validos = input.filter(
    (valor): valor is number => typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor <= 6
  );
  return [...new Set(validos)].sort((a, b) => a - b);
}
