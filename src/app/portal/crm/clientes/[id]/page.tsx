import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeClienteMetrics, computePreferencias } from "@/lib/crm";
import { ClienteProfileClient } from "./cliente-profile-client";

export default async function ClienteProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const cliente = await prisma.cliente.findFirst({
    where: { id, empresaId: { in: empresaIds } },
    include: {
      empresa: { select: { name: true, color: true } },
      notas: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      vendas: {
        orderBy: { dateTime: "desc" },
        include: { items: { select: { nome: true, categoria: true, quantidade: true, precoUnitario: true } } },
      },
    },
  });

  if (!cliente) notFound();

  const [metrics] = computeClienteMetrics([
    {
      id: cliente.id,
      empresaId: cliente.empresaId,
      nome: cliente.nome,
      telefone: cliente.telefone,
      whatsapp: cliente.whatsapp,
      email: cliente.email,
      dataNascimento: cliente.dataNascimento,
      endereco: cliente.endereco,
      bairro: cliente.bairro,
      cidade: cliente.cidade,
      canalPreferido: cliente.canalPreferido,
      createdAt: cliente.createdAt,
      vendas: cliente.vendas.map((v) => ({ id: v.id, dateTime: v.dateTime, valorTotal: v.valorTotal, channel: v.channel })),
    },
  ]);

  const preferencias = computePreferencias(
    cliente.vendas.map((v) => ({ dateTime: v.dateTime, channel: v.channel, items: v.items }))
  );

  return (
    <PageContainer title="CRM" subtitle={cliente.nome} backHref="/portal/crm/clientes" backLabel="Voltar para Clientes">
      <ClienteProfileClient
        cliente={{
          id: cliente.id,
          nome: cliente.nome,
          telefone: cliente.telefone,
          whatsapp: cliente.whatsapp,
          email: cliente.email,
          dataNascimento: cliente.dataNascimento ? cliente.dataNascimento.toISOString().slice(0, 10) : null,
          endereco: cliente.endereco,
          bairro: cliente.bairro,
          cidade: cliente.cidade,
          lojaNome: cliente.empresa.name,
          lojaColor: cliente.empresa.color,
        }}
        metrics={{
          pedidos: metrics.pedidos,
          totalGasto: metrics.totalGasto,
          ticketMedio: metrics.ticketMedio,
          status: metrics.status,
          ultimaCompra: metrics.ultimaCompra ? metrics.ultimaCompra.toISOString() : null,
          diasDesdeUltimaCompra: metrics.diasDesdeUltimaCompra,
          frequenciaMediaDias: metrics.frequenciaMediaDias,
        }}
        preferencias={preferencias}
        vendas={cliente.vendas.map((v) => ({
          id: v.id,
          dateTime: v.dateTime.toISOString(),
          valorTotal: v.valorTotal,
          channel: v.channel,
          items: v.items.map((i) => ({ nome: i.nome, quantidade: i.quantidade })),
        }))}
        notas={cliente.notas.map((n) => ({
          id: n.id,
          texto: n.texto,
          autor: n.author.name,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </PageContainer>
  );
}
