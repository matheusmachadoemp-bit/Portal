"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type InsumoOption = { id: string; name: string; setor: string | null };

export type IniciarOpcoes = {
  /** `undefined` = todos os ativos do setor (comportamento de sempre). */
  ingredientIds: string[] | undefined;
  /** Valor de `<input type="datetime-local">` ("" = sem prazo). */
  prazo: string;
};

export const INICIAR_OPCOES_VAZIAS: IniciarOpcoes = { ingredientIds: undefined, prazo: "" };

/** Converte o valor do campo de prazo (hora local do navegador) em ISO pra API. */
export function prazoParaApi(prazo: string): string | undefined {
  if (!prazo) return undefined;
  const d = new Date(prazo);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Campos opcionais do modal "Iniciar contagem" (semanal e mensal): prazo e escolha manual dos
 * itens que entram na contagem. Sem mexer em nada, a contagem sai como antes (todos os insumos
 * ativos do setor, sem prazo). A lista vem de GET /api/estoque/contagens/insumos (sem preço).
 */
export function IniciarOpcoesCampos({
  setor,
  value,
  onChange,
}: {
  setor: string;
  value: IniciarOpcoes;
  onChange: (v: IniciarOpcoes) => void;
}) {
  const [manual, setManual] = useState(false);
  const [insumos, setInsumos] = useState<InsumoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  // Sempre o valor mais recente (o efeito de carregar a lista roda assíncrono; sem isso ele
  // gravaria de volta um prazo/seleção antigos capturados no início do carregamento).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  // Recarrega a lista ao ligar a seleção manual ou trocar o setor (os ids antigos deixam de valer).
  useEffect(() => {
    if (!manual) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a lista ao ligar a seleção manual
    setLoading(true);
    setLoadError(null);
    // Enquanto a lista não chega (ou se falhar), nenhum item está selecionado: assim "Iniciar"
    // nunca sai com os itens do setor anterior nem com "todos" por engano.
    onChange({ ...valueRef.current, ingredientIds: [] });
    fetch(`/api/estoque/contagens/insumos${setor ? `?setor=${encodeURIComponent(setor)}` : ""}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? "Não foi possível carregar os insumos.");
          return;
        }
        const list = (data.ingredients ?? []) as InsumoOption[];
        setInsumos(list);
        onChange({ ...valueRef.current, ingredientIds: list.map((i) => i.id) });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Falha de conexão ao carregar os insumos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `value`/`onChange` ficam de fora de propósito: só recarrega quando liga/desliga ou muda o setor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, setor]);

  const selected = useMemo(() => new Set(value.ingredientIds ?? []), [value.ingredientIds]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? insumos.filter((i) => i.name.toLowerCase().includes(q)) : insumos;
  }, [insumos, busca]);

  function toggleManual(on: boolean) {
    setManual(on);
    setBusca("");
    if (!on) onChange({ ...value, ingredientIds: undefined });
  }

  function toggleItem(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, ingredientIds: Array.from(next) });
  }

  function setAll(ids: string[]) {
    onChange({ ...value, ingredientIds: ids });
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-xs text-nord-gray mb-1">Prazo para concluir (opcional)</span>
        <input
          className="input"
          type="datetime-local"
          value={value.prazo}
          onChange={(e) => onChange({ ...value, prazo: e.target.value })}
        />
      </label>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
          <input type="checkbox" checked={manual} onChange={(e) => toggleManual(e.target.checked)} />
          Escolher manualmente quais itens contar
        </label>
        {!manual && (
          <p className="text-[11px] text-nord-gray">
            Desmarcado: a contagem leva todos os itens ativos {setor ? `do setor ${setor}` : "da loja"}.
          </p>
        )}

        {manual && (
          <div className="space-y-2">
            {loading ? (
              <p className="text-xs text-nord-gray">Carregando itens...</p>
            ) : loadError ? (
              <p className="text-xs text-nord-danger">{loadError}</p>
            ) : insumos.length === 0 ? (
              <p className="text-xs text-nord-gray">Nenhum item ativo encontrado {setor ? "neste setor" : "nesta loja"}.</p>
            ) : (
              <>
                <input
                  className="input"
                  placeholder="Buscar item..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <div className="flex items-center justify-between text-[11px] text-nord-gray">
                  <span>
                    {selected.size} de {insumos.length} selecionado(s)
                  </span>
                  <span className="flex gap-3">
                    <button type="button" className="hover:text-white" onClick={() => setAll(insumos.map((i) => i.id))}>
                      Marcar todos
                    </button>
                    <button type="button" className="hover:text-white" onClick={() => setAll([])}>
                      Limpar
                    </button>
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-nord-border divide-y divide-nord-border">
                  {visiveis.map((i) => (
                    <label key={i.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-white cursor-pointer hover:bg-nord-panel">
                      <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleItem(i.id)} />
                      <span className="truncate">{i.name}</span>
                      {!setor && i.setor && <span className="ml-auto text-[10px] text-nord-gray shrink-0">{i.setor}</span>}
                    </label>
                  ))}
                  {visiveis.length === 0 && <p className="px-2.5 py-2 text-xs text-nord-gray">Nada encontrado.</p>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
