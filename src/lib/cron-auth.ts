/**
 * Compara o header `Authorization: Bearer <segredo>` de um disparo de cron (Vercel Cron nativo,
 * ver `vercel.json`) contra `CRON_SECRET` de forma resistente a timing attack.
 *
 * Antes desta função, cada rota de cron (e `middleware.ts`) comparava o header recebido contra
 * `` `Bearer ${process.env.CRON_SECRET}` `` com `===`/`!==` — comparação de string "ingênua" do
 * motor JS, que compara caractere a caractere e retorna assim que encontra a primeira diferença.
 * Isso abre uma janela (pequena, mas real) de timing attack: medindo o tempo de resposta de
 * muitas tentativas, um atacante pode inferir o segredo prefixo por prefixo (quanto mais
 * caracteres iniciais ele acerta, mais a comparação "ingênua" demora pra falhar). Achado do
 * Jonas, auditoria de segurança 2026-11.
 *
 * Importante: `middleware.ts` (convenção deprecada no Next.js 16, mas ainda em uso aqui — ver
 * nota no próprio arquivo) continua rodando no runtime Edge por padrão (só o novo `proxy.ts`
 * força runtime Node.js; "If you want to continue using the edge runtime, keep using
 * middleware" — guia de upgrade do Next 16). O runtime Edge NÃO suporta o módulo `node:crypto`
 * (`crypto.timingSafeEqual`/`createHash` de lá quebram com "The edge runtime does not support
 * Node.js 'crypto' module" — confirmado ao vivo nesta tarefa: a 1ª versão desta função usava
 * `node:crypto` e derrubava TODA requisição que passasse por `middleware.ts`, não só as de cron).
 * Por isso esta função usa só a Web Crypto API (`globalThis.crypto.subtle`), disponível tanto no
 * runtime Edge quanto no runtime Node.js (Node 19+, sem import nenhum) — um único helper,
 * utilizável sem diferença nos dois contextos, exatamente como pedido.
 *
 * `crypto.subtle.digest` não tem equivalente direto a `timingSafeEqual` na Web Crypto API — por
 * isso os dois lados primeiro passam por SHA-256 (tamanho fixo, 32 bytes, então nunca precisa
 * checar tamanho antes de comparar — evita o próprio "if de tamanho" reabrir uma janela de
 * timing) e so depois são comparados byte a byte com XOR acumulado (sem early-return: o loop
 * sempre percorre os 32 bytes inteiros, não importa onde a primeira diferença apareça).
 */
async function sha256(value: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false; // nunca deveria acontecer (os dois são sempre um digest SHA-256 de 32 bytes) — só defensivo.
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function isValidCronSecret(authorizationHeader: string | null | undefined): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (!authorizationHeader) return false;

  const [expected, received] = await Promise.all([sha256(`Bearer ${secret}`), sha256(authorizationHeader)]);
  return constantTimeEqual(expected, received);
}
