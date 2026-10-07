"use client";

import { Modal } from "@/components/ui/modal";
import type { ProductionOrderDTO } from "./types";

/**
 * Mostra o modo de preparo (passo a passo em texto livre, cadastrado em
 * Produção > Produtos) do item de uma ordem de produção — compartilhado
 * entre Produção de Hoje e Planejamento, já que as duas telas trabalham
 * com o mesmo ProductionOrderDTO.
 */
export function ModoPreparoModal({ ordem, onClose }: { ordem: ProductionOrderDTO; onClose: () => void }) {
  const modoPreparo = ordem.productionItem.modoPreparo;
  return (
    <Modal open onClose={onClose} title={`Modo de preparo — ${ordem.productionItem.name}`}>
      {modoPreparo ? (
        <p className="text-sm text-white whitespace-pre-wrap">{modoPreparo}</p>
      ) : (
        <p className="text-sm text-nord-gray text-center py-8">Modo de preparo ainda não cadastrado.</p>
      )}
    </Modal>
  );
}
