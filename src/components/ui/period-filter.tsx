"use client";

import { useEffect, useState } from "react";
import { STANDARD_PERIOD_OPTIONS, type RollingPeriodKey } from "@/lib/periods";

/**
 * Filtro de período padrão do portal — Hoje, Ontem, Últimos 7 dias, Este mês,
 * Mês passado e Personalizado (ver CLAUDE.md). `periodo` é o valor já
 * aplicado (vindo do componente pai); ao clicar num preset, `onApply` é
 * chamado na hora, já buscando o novo período — "Personalizado" só chama
 * `onApply` quando o usuário clicar em "Aplicar", depois de escolher as datas.
 */
export function PeriodFilterBar({
  periodo,
  onApply,
  loading = false,
}: {
  periodo: RollingPeriodKey;
  onApply: (key: RollingPeriodKey, from?: string, to?: string) => void;
  loading?: boolean;
}) {
  const [selected, setSelected] = useState<RollingPeriodKey>(periodo);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflete o período efetivamente aplicado pelo pai (ex.: após carregar dados iniciais)
    setSelected(periodo);
  }, [periodo]);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {STANDARD_PERIOD_OPTIONS.map((opt) => (
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
            onClick={() => onApply("personalizado", customFrom, customTo)}
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
