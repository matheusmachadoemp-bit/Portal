import { loadPurchaseByToken, receivingState } from "@/lib/recebimento-server";
import { ConferenciaClient } from "./conferencia-client";

const STATE_MESSAGE: Record<string, { title: string; body: string }> = {
  invalido: { title: "Link inválido", body: "Esse link de recebimento não existe." },
  cancelado: { title: "Pedido cancelado", body: "Esse pedido de compra foi cancelado e não aceita mais recebimento." },
  finalizado: { title: "Recebimento já finalizado", body: "Esse pedido já teve o recebimento concluído." },
};

export default async function RecebimentoTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const purchase = await loadPurchaseByToken(token);
  const state = receivingState(purchase);

  if (state !== "ok") {
    const msg = STATE_MESSAGE[state];
    return (
      <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-nord-panel border border-nord-border rounded-2xl p-6 text-center space-y-2">
          <h1 className="text-white font-semibold text-lg">{msg.title}</h1>
          <p className="text-nord-gray text-sm">{msg.body}</p>
        </div>
      </div>
    );
  }

  const p = purchase!;
  const serialized = {
    id: p.id,
    numero: p.id.slice(-5).toUpperCase(),
    status: p.status,
    data: p.data.toISOString(),
    previsaoEntrega: p.previsaoEntrega ? p.previsaoEntrega.toISOString() : null,
    valorPrevisto: p.items.reduce((s, it) => s + it.valorTotal, 0) + p.frete - p.desconto,
    supplierName: p.supplier.nomeFantasia ?? p.supplier.razaoSocial,
    responsavelNome: p.responsavelRecebimento?.name ?? null,
    receivingIniciado: !!p.receiving,
    itens: p.items.map((it) => ({
      id: it.id,
      nome: it.ingredient.name,
      unidade: it.unidade,
      quantidadePedida: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal: it.valorTotal,
      exigirPeso: it.ingredient.exigirPeso,
      exigirValidade: it.ingredient.exigirValidade,
      exigirTemperatura: it.ingredient.exigirTemperatura,
      exigirFoto: it.ingredient.exigirFoto,
      conferencia: it.receivingItem
        ? {
            status: it.receivingItem.status,
            quantidadeRecebida: it.receivingItem.quantidadeRecebida,
            pesoAferido: it.receivingItem.pesoAferido,
            temperaturaAferida: it.receivingItem.temperaturaAferida,
            validadeInformada: it.receivingItem.validadeInformada ? it.receivingItem.validadeInformada.toISOString() : null,
            precoInformado: it.receivingItem.precoInformado,
            fotoUrl: it.receivingItem.fotoUrl,
            divergenciaTipos: it.receivingItem.divergenciaTipos,
            divergenciaDescricao: it.receivingItem.divergenciaDescricao,
          }
        : null,
    })),
  };

  return (
    <div className="min-h-screen w-full bg-nord-black">
      <ConferenciaClient token={token} purchase={serialized} empresaName={p.empresa.name} />
    </div>
  );
}
