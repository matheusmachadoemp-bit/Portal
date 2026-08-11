import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CrmTabs } from "../crm-tabs";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/calc";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeRfv, RFV_SEGMENT_TONE } from "@/lib/rfv";
import { differenceInCalendarDays, format } from "date-fns";

export default async function ClientesPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const clientes = await prisma.cliente.findMany({
    where: { empresaId: { in: empresaIds } },
    include: { vendas: { select: { dateTime: true, valorTotal: true } } },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const comHistorico = clientes.filter((c) => c.vendas.length > 0);
  const rfvInputs = comHistorico.map((c) => {
    const ultimaCompra = c.vendas.reduce((max, s) => (s.dateTime > max ? s.dateTime : max), c.vendas[0].dateTime);
    return {
      clienteId: c.id,
      diasDesdeUltimaCompra: differenceInCalendarDays(now, ultimaCompra),
      frequencia: c.vendas.length,
      valor: c.vendas.reduce((sum, s) => sum + s.valorTotal, 0),
    };
  });
  const rfvById = new Map(computeRfv(rfvInputs).map((r) => [r.clienteId, r]));

  return (
    <PageContainer title="CRM" subtitle="Clientes">
      <div className="space-y-6">
        <CrmTabs />
        <Section title={`Base de clientes (${clientes.length})`}>
          <p className="text-xs text-nord-gray mb-4">
            Clientes são criados automaticamente ao informar o telefone em Vendas → Lançamentos.
          </p>
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Telefone</th>
                  <th className="py-2 pr-4">Cliente desde</th>
                  <th className="py-2 pr-4">Compras</th>
                  <th className="py-2 pr-4">Total gasto</th>
                  <th className="py-2 pr-4">Segmento RFV</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => {
                  const rfv = rfvById.get(c.id);
                  const totalGasto = c.vendas.reduce((sum, s) => sum + s.valorTotal, 0);
                  return (
                    <tr key={c.id} className="border-b border-nord-border/50 hover:bg-white/5">
                      <td className="py-2.5 pr-4 text-white">{c.nome}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{c.telefone ?? "-"}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{format(c.createdAt, "dd/MM/yyyy")}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{c.vendas.length}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(totalGasto)}</td>
                      <td className="py-2.5 pr-4">
                        {rfv ? <Badge tone={RFV_SEGMENT_TONE[rfv.segmento]}>{rfv.segmento}</Badge> : <span className="text-nord-gray text-xs">Sem histórico</span>}
                      </td>
                    </tr>
                  );
                })}
                {clientes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-nord-gray">
                      Nenhum cliente cadastrado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
