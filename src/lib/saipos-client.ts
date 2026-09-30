const SAIPOS_DATA_API_BASE = "https://data.saipos.io/v1";
const MAX_RANGE_DAYS = 15;
const PAGE_LIMIT = 1000;
// A Saipos ocasionalmente responde 502/503/504 quando o banco deles está
// sobrecarregado (ex.: "Timed out acquiring connection from connection
// pool."). É uma falha temporária do lado deles, não um erro real de dados,
// então vale tentar de novo antes de desistir da sincronização inteira.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [2000, 5000, 10000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SaiposSaleRecord = {
  id_sale: number;
  shift_date: string;
  created_at: string;
  total_amount?: number;
  canceled?: string | boolean | number;
  table_order?: unknown;
  delivery?: { delivery_by?: string | null; district?: string | null } | null;
  partner_sale?: { desc_partner_sale?: string | null } | null;
  payments?: { payment_amount: number; desc_store_payment_type?: string | null }[];
  [key: string]: unknown;
};

export type SaiposClientResult =
  | { ok: true; sales: SaiposSaleRecord[] }
  | { ok: false; error: string };

/**
 * Busca vendas na API de Dados da Saipos, paginando automaticamente.
 * A API limita cada chamada a um intervalo de até 15 dias e 1000 registros.
 */
export async function fetchSaiposSales(
  token: string,
  range: { start: Date; end: Date }
): Promise<SaiposClientResult> {
  const rangeDays = (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24);
  if (rangeDays > MAX_RANGE_DAYS) {
    return { ok: false, error: `Intervalo máximo permitido pela Saipos é de ${MAX_RANGE_DAYS} dias.` };
  }

  const allSales: SaiposSaleRecord[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      p_date_column_filter: "shift_date",
      p_filter_date_start: formatSaiposDate(range.start),
      p_filter_date_end: formatSaiposDate(range.end),
      p_limit: String(PAGE_LIMIT),
      p_offset: String(offset),
    });

    let res: Response | null = null;
    let lastError = "";
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        res = await fetch(`${SAIPOS_DATA_API_BASE}/search_sales?${params.toString()}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } catch {
        lastError = "Falha de conexão com a API da Saipos.";
        res = null;
      }

      if (res && !RETRYABLE_STATUS.has(res.status)) break;
      if (res) lastError = `Erro ${res.status} na API da Saipos (instabilidade temporária).`;
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS[attempt]);
    }

    if (!res) {
      return { ok: false, error: lastError || "Falha de conexão com a API da Saipos." };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Erro ${res.status} na API da Saipos. ${body}`.trim() };
    }

    const data = await res.json().catch(() => null);
    const page: SaiposSaleRecord[] = Array.isArray(data) ? data : (data?.data ?? []);
    allSales.push(...page);

    if (page.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return { ok: true, sales: allSales };
}

const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * A Saipos espera as datas no horário local da loja (Brasília, UTC-3, sem
 * horário de verão desde 2019), não em UTC — por isso o offset abaixo antes
 * de formatar.
 *
 * Esta correção já tinha sido feita 2 vezes antes (commits 4322c17 e
 * 68be325) e perdida nas 2 vezes num merge que trouxe uma versão antiga do
 * arquivo por cima (mesma classe de incidente documentada no CLAUDE.md sobre
 * trabalho perdido em merge) — nunca foi reintroduzida depois disso, e o
 * código ficou mandando a janela de busca para a API da Saipos em UTC puro
 * desde então. Efeito prático: o filtro `p_filter_date_start`/
 * `p_filter_date_end` enviado à Saipos fica sistematicamente deslocado 3h
 * PARA FRENTE (mais tarde) em relação ao pretendido — ambos os limites da
 * janela (início e fim) são interpretados pela Saipos como 3h depois do que
 * o código pretendia, então o início efetivo da janela de busca "come" 3h
 * logo no começo do intervalo pretendido. Quando a sincronização (cron
 * diário ou botão "Sincronizar agora") acontece durante o horário de
 * funcionamento da loja (18h-23h30, quando o Matheus mais costuma estar no
 * sistema), essas 3h perdidas caem dentro do próprio expediente — vendas
 * reais desse intervalo nunca chegam a ser gravadas em SaiposSale/Sale (não
 * é um problema de exibição/fuso na leitura, é a linha nunca existir no
 * banco), subcontando corretamente qualquer métrica agregada que dependa
 * delas (total do dia, ticket médio geral/por canal, soma do mês). Achado
 * durante a investigação do sumiço de vendas do Saipos no Faturamento
 * (worktree investigar-faturamento-mes) — reproduzido com dado fabricado:
 * linhas realmente ausentes (não só mal bucketizadas por hora) reproduzem os
 * 3 sintomas relatados (buraco de horário + ticket médio + mês errados) de
 * forma unificada, enquanto um mero erro de parsing de horário por venda
 * reproduz só o buraco no gráfico por hora, sem afetar totais/médias.
 */
function formatSaiposDate(date: Date): string {
  return new Date(date.getTime() - BRASILIA_OFFSET_MS).toISOString().slice(0, 19);
}
