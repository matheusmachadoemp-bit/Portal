/**
 * Leitura de código de barras/QR de boleto em Financeiro > Contas a Pagar: normaliza o texto lido
 * pela câmera (ou digitado manualmente) antes de guardar, e — quando é um boleto bancário ou de
 * arrecadação/convênio reconhecível pelo layout Febraban/BCB — extrai valor e vencimento do
 * próprio código, para pré-preencher o formulário (editável, nunca travado).
 *
 * Isomórfico (sem `"use client"`/sem nada exclusivo de Node): usado tanto no formulário (client)
 * quanto nas rotas de API (server, para normalizar antes de checar duplicidade). A extração usa
 * `@brazilian-utils/brazilian-utils` (MIT, zero dependências, mantida ativamente) em vez de
 * reimplementar o módulo 11/10 e o cálculo do "fator de vencimento" à mão — ver `extractBoletoFields`
 * abaixo para o motivo de ESCOLHER essa biblioteca em vez de recalcular isso aqui.
 */
import { isValidBoleto } from "@brazilian-utils/brazilian-utils/is-valid-boleto";
import { getBoletoInfo } from "@brazilian-utils/brazilian-utils/get-boleto-info";

// Linha digitável/código de barras digitado manualmente costuma vir com máscara (pontos, espaços,
// hífen e barra entre os blocos de dígitos) — ex. "34191.09008 01644.310005 06318.780008 1
// 87420000010000". Isso é só o jeito de reconhecer esse formato, não a extração de valor/data.
const DIGITS_WITH_MASK = /^\d+(?:[\s.\-/]+\d+)*$/;
const MASK_CHARS = /[\s.\-/]/g;

/**
 * Normaliza o texto lido/digitado antes de guardar ou comparar: se é um código "de boleto"
 * (só dígitos, possivelmente com a máscara de pontuação da linha digitável entre eles), guarda só
 * os dígitos — assim a mesma conta lida pela câmera (código de barras, 44 dígitos, sem máscara) e
 * digitada manualmente (linha digitável, 47/48 dígitos, com máscara) caem no mesmo valor
 * canônico, e a checagem de duplicidade funciona nos dois casos. Qualquer outro formato (ex.: Pix
 * "copia e cola", que mistura letras e números) é devolvido exatamente como veio — nenhum
 * caractere dele é "máscara", então não há nada para tirar.
 */
export function normalizeScannedCode(raw: string): string {
  const trimmed = raw.trim();
  if (DIGITS_WITH_MASK.test(trimmed)) return trimmed.replace(MASK_CHARS, "");
  return trimmed;
}

export type BoletoExtracted = {
  /** Valor em reais (já convertido de centavos). */
  valor: number;
  /** Data de vencimento, ou `undefined` quando o layout do código não carrega essa informação
   *  (boleto de arrecadação/convênio) — nesse caso a tela NÃO deve apagar o que já estava no
   *  campo, é diferente de "vencimento desconhecido = hoje" ou qualquer outro valor padrão. */
  vencimento?: Date;
};

/**
 * Tenta calcular valor e vencimento a partir de um código JÁ NORMALIZADO (ver
 * `normalizeScannedCode`). Só devolve algo quando o código passa a validação do próprio layout
 * (dígito verificador módulo 11/10 batendo) E tem um valor monetário de fato codificado:
 *
 * - Boleto bancário (cobrança): valor nas posições 10-19, vencimento calculado do "fator de
 *   vencimento" (posições 6-9). Retorna `null` quando é um boleto "Situação 2" (carrega o ISPB da
 *   instituição no lugar do valor, sem valor nenhum codificado) ou quando o valor vem zerado
 *   (convenção do layout para "boleto sem valor fixo no código", ex. alguns carnês).
 * - Boleto de arrecadação/convênio (tributos, concessionárias): o layout NUNCA carrega vencimento
 *   no código de barras (por isso `vencimento` fica `undefined` nesse caso — a tela não deve
 *   mexer no campo de vencimento). O valor só é confiável quando `hasEffectiveValue` é `true`
 *   (o dígito correspondente diz que o campo é um valor em reais, não uma quantidade de
 *   referência que o layout permite colocar no mesmo lugar).
 * - QR Pix ("copia e cola", formato BR Code/EMV): não é um código de boleto (mistura letras e
 *   números, tem outro layout inteiro) — `isValidBoleto` já devolve `false` para ele de forma
 *   nativa, então cai direto no `return null` abaixo. O código ainda é guardado normalmente (ver
 *   `normalizeScannedCode`), só não tenta decompor valor/vencimento dele.
 *
 * Por que usar uma biblioteca em vez de calcular à mão: o cálculo do dígito verificador em si é
 * estável (módulo 11/10, documentado pela Carta-Circular BCB nº 2.926/2000), mas o "fator de
 * vencimento" NÃO é mais uma conta direta desde 22/02/2025 — a Febraban/os bancos reiniciaram a
 * contagem de 4 dígitos nessa data (ela chegaria a 10000 e não cabe mais no campo), então o mesmo
 * número de 4 dígitos passou a poder significar duas datas ~9000 dias (~24,6 anos) distantes uma
 * da outra, sem nenhuma forma 100% determinística de saber qual delas é a certa só olhando o
 * código (nem a Febraban nem o Banco Central publicaram uma regra oficial de desambiguação; a
 * regra só aparece em manuais de banco, ex. Bradesco "Layout da Cobrança" versão 17). A biblioteca
 * `@brazilian-utils/brazilian-utils` (MIT, zero dependências, atualizada em outubro/2026) resolve
 * essa ambiguidade assumindo que o vencimento real está "razoavelmente perto" da data de hoje —
 * a mesma heurística que qualquer reimplementação própria teria que fazer, só que já escrita,
 * documentada e testada, reduzindo o risco de um erro de transcrição no módulo 11 silenciosamente
 * calcular uma data ou um valor errado. Essa ambiguidade (e a heurística) está documentada no
 * JSDoc de `getBoletoInfo` da própria biblioteca.
 */
export function extractBoletoFields(code: string): BoletoExtracted | null {
  if (!isValidBoleto(code)) return null;
  const info = getBoletoInfo(code);
  if (!info) return null;
  if (info.ispb) return null; // "Situação 2": sem valor codificado, só o ISPB da instituição.

  if (info.type === "arrecadacao") {
    if (!info.hasEffectiveValue || !info.amount) return null;
    return { valor: info.amount / 100 }; // sem `vencimento`: o layout de arrecadação não carrega essa data.
  }

  if (!info.amount) return null;
  return { valor: info.amount / 100, vencimento: info.expirationDate ?? undefined };
}
