const SAIPOS_DATA_API_BASE = "https://data.saipos.io/v1";
const MAX_RANGE_DAYS = 15;
const PAGE_LIMIT = 1000;

export type SaiposSaleRecord = {
  id_sale: number;
  shift_date: string;
  created_at: string;
  total_amount?: number;
  canceled?: string | boolean;
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

    let res: Response;
    try {
      res = await fetch(`${SAIPOS_DATA_API_BASE}/search_sales?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
    } catch {
      return { ok: false, error: "Falha de conexão com a API da Saipos." };
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
 */
function formatSaiposDate(date: Date): string {
  return new Date(date.getTime() - BRASILIA_OFFSET_MS).toISOString().slice(0, 19);
}
