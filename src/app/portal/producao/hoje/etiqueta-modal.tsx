"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { ProductionOrderDTO } from "../types";

function imprimirEtiquetas(ordem: ProductionOrderDTO, quantidade: number) {
  const win = window.open("", "_blank", "width=420,height=600");
  if (!win) return;

  const dataProducao = ordem.horaFim ? new Date(ordem.horaFim).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");
  const validade = ordem.validade ? new Date(ordem.validade).toLocaleDateString("pt-BR") : "—";
  const responsavel = ordem.responsavel?.name ?? "—";

  const etiqueta = `
    <div style="border: 1px dashed #999; border-radius: 8px; padding: 14px; margin-bottom: 12px; page-break-inside: avoid;">
      <p style="font-size: 16px; font-weight: 700; margin: 0 0 6px;">${ordem.productionItem.name}</p>
      <p style="font-size: 12px; margin: 2px 0;"><strong>Produção:</strong> ${dataProducao}</p>
      <p style="font-size: 12px; margin: 2px 0;"><strong>Validade:</strong> ${validade}</p>
      <p style="font-size: 12px; margin: 2px 0;"><strong>Responsável:</strong> ${responsavel}</p>
    </div>
  `;

  win.document.write(`
    <html>
      <head><title>Etiqueta — ${ordem.productionItem.name}</title></head>
      <body style="font-family: sans-serif; padding: 16px;">
        ${etiqueta.repeat(quantidade)}
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  win.document.close();
}

export function EtiquetaModal({ ordem, onClose }: { ordem: ProductionOrderDTO; onClose: () => void }) {
  const [quantidade, setQuantidade] = useState(1);

  return (
    <Modal open onClose={onClose} title={`Imprimir etiqueta — ${ordem.productionItem.name}`}>
      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Quantidade de etiquetas</span>
          <input
            type="number"
            min={1}
            value={quantidade}
            onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))}
            className="input"
          />
        </label>
        <button
          onClick={() => {
            imprimirEtiquetas(ordem, quantidade);
            onClose();
          }}
          className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5"
        >
          Imprimir
        </button>
      </div>
    </Modal>
  );
}
