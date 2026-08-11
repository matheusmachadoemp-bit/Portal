import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CrmTabs } from "../crm-tabs";
import { RfvClient } from "./rfv-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeRfv } from "@/lib/rfv";
import { differenceInCalendarDays } from "date-fns";

export default async function RfvPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const clientes = await prisma.cliente.findMany({
    where: { empresaId: { in: empresaIds }, vendas: { some: {} } },
    include: { vendas: { select: { dateTime: true, valorTotal: true } } },
  });

  const now = new Date();
  const inputs = clientes.map((c) => {
    const ultimaCompra = c.vendas.reduce((max, s) => (s.dateTime > max ? s.dateTime : max), c.vendas[0].dateTime);
    const valor = c.vendas.reduce((sum, s) => sum + s.valorTotal, 0);
    return {
      clienteId: c.id,
      nome: c.nome,
      telefone: c.telefone,
      diasDesdeUltimaCompra: differenceInCalendarDays(now, ultimaCompra),
      frequencia: c.vendas.length,
      valor,
    };
  });

  const rfv = computeRfv(inputs);
  const merged = rfv.map((r) => {
    const info = inputs.find((i) => i.clienteId === r.clienteId)!;
    return { ...r, nome: info.nome, telefone: info.telefone };
  });

  return (
    <PageContainer title="CRM" subtitle="Análise RFV">
      <div className="space-y-6">
        <CrmTabs />
        <RfvClient clientes={merged} />
      </div>
    </PageContainer>
  );
}
