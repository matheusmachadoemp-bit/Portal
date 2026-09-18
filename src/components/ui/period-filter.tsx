"use client";

import { useEffect, useState } from "react";
import { STANDARD_PERIOD_OPTIONS, type RollingPeriodKey } from "@/lib/periods";

/** Formato de cada opção da fileira de botões: chave interna + rótulo exibido. */
export type PeriodFilterOption<K extends string> = { key: K; label: string };

/**
 * Filtro de período padrão do portal — fileira de botões (nunca dropdown).
 * Por padrão mostra os 6 presets "rolling" do portal (Hoje, Ontem, Últimos 7
 * dias, Este mês, Mês passado e Personalizado — ver CLAUDE.md), mas aceita
 * via prop `options` um conjunto de opções diferente (com sua própria chave
 * `K`) para telas que precisam de outros presets (ex.: Tarefas, que filtra
 * por prazo no futuro: Hoje/Amanhã/Esta semana/Próxima semana/Este mês).
 * Em qualquer conjunto de opções, a chave `"personalizado"` é tratada como o
 * preset especial que abre o par de campos de data + botão "Aplicar".
 *
 * `periodo` é o valor já aplicado (vindo do componente pai); ao clicar num
 * preset, `onApply` é chamado na hora, já buscando o novo período —
 * "Personalizado" só chama `onApply` quando o usuário clicar em "Aplicar",
 * depois de escolher as datas. `initialCustomFrom`/`initialCustomTo`
 * pré-preenchem os campos de data quando a tela já carrega com um período
 * personalizado aplicado (ex.: um intervalo padrão calculado no servidor que
 * não corresponde a nenhum preset) — sem eles, os campos nascem em branco
 * mesmo com `periodo="personalizado"`.
 */
export function PeriodFilterBar<K extends string = RollingPeriodKey>({
  periodo,
  onApply,
  loading = false,
  initialCustomFrom = "",
  initialCustomTo = "",
  options,
}: {
  periodo: K;
  onApply: (key: K, from?: string, to?: string) => void;
  loading?: boolean;
  initialCustomFrom?: string;
  initialCustomTo?: string;
  /** Opções customizadas da fileira de botões. Padrão: STANDARD_PERIOD_OPTIONS. */
  options?: PeriodFilterOption<K>[];
}) {
  const opts = options ?? (STANDARD_PERIOD_OPTIONS as unknown as PeriodFilterOption<K>[]);
  const [selected, setSelected] = useState<K>(periodo);
  const [customFrom, setCustomFrom] = useState(initialCustomFrom);
  const [customTo, setCustomTo] = useState(initialCustomTo);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflete o período efetivamente aplicado pelo pai (ex.: após carregar dados iniciais)
    setSelected(periodo);
  }, [periodo]);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((opt) => (
          <button
            key={opt.key}
            onClick={() => {
              if (opt.key !== "personalizado") onApply(opt.key);
              else setSelected(opt.key);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              selected === opt.key ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {selected === "personalizado" && (
        <div className="flex items-center gap-2 mt-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input !w-auto" />
          <span className="text-xs text-nord-gray">até</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input !w-auto" />
          <button
            onClick={() => onApply(selected, customFrom, customTo)}
            disabled={!customFrom || !customTo || loading}
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
