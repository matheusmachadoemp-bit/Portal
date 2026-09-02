import { NextRequest, NextResponse } from "next/server";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics } from "@/lib/crm";

// TEMPORARY, read-only diagnostic route. Delete after use.
// The CRM > Clientes list page (/portal/crm/clientes) is throwing a server
// error (same Vercel error digest both before and after the cliente import
// fixes), reproducibly, right after importing ~996 clientes. Runs the exact
// same data-loading + mapping logic as that page's server component, but
// catches and returns the real error instead of Next's generic fallback.
const FIX_TOKEN = "a3f7c9e1d5b28046a9c7e1f3b5d8206a9c7e1f38d";
const EMPRESA_ID = "cmsndjpe00000497dhfcr8mzd";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const clientes = await loadClientesCompletos([EMPRESA_ID]);
    const metrics = computeClienteMetrics(clientes);
    const metricsById = new Map(metrics.map((m) => [m.id, m]));

    const rows = clientes.map((c) => {
      const m = metricsById.get(c.id)!;
      const produtos = Array.from(new Set(c.vendas.flatMap((v) => v.items.map((i) => i.nome))));
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        whatsapp: c.whatsapp,
        email: c.email,
        lojaId: c.empresa.id,
        lojaNome: c.empresa.name,
        lojaColor: c.empresa.color,
        bairro: c.bairro,
        cidade: c.cidade,
        canalPreferido: c.canalPreferido,
        createdAt: c.createdAt.toISOString(),
        ehNovo: m.ehNovo,
        pedidos: m.pedidos,
        totalGasto: m.totalGasto,
        ticketMedio: m.ticketMedio,
        ultimaCompra: m.ultimaCompra ? m.ultimaCompra.toISOString() : null,
        diasDesdeUltimaCompra: m.diasDesdeUltimaCompra,
        frequenciaMediaDias: m.frequenciaMediaDias,
        status: m.status,
        produtos,
      };
    });

    return NextResponse.json({ ok: true, count: rows.length, sample: rows.slice(0, 2) });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}
