"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

export function CompareMonthsPicker({
  periodos,
  onChange,
}: {
  periodos: [string, string, string];
  onChange: (periodos: [string, string, string]) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = periodos.some(Boolean);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
          active ? "border-nord-blue text-nord-blue-light" : "border-nord-border text-nord-gray hover:text-white hover:border-nord-blue-light"
        }`}
      >
        <SlidersHorizontal size={13} /> {active ? "Comparação personalizada" : "Comparar meses"}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 nord-card p-4 shadow-xl">
          <p className="text-xs text-nord-gray mb-3">
            Escolha até 3 meses para comparar no PDF (ex.: Jan/2025 x Jan/2026, ou Jun x Jul x Ago). Deixe em branco
            para usar o padrão (mês atual + 2 anteriores).
          </p>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                type="month"
                value={periodos[i]}
                onChange={(e) => {
                  const next = [...periodos] as [string, string, string];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                className="input"
              />
            ))}
          </div>
          {active && (
            <button
              onClick={() => onChange(["", "", ""])}
              className="mt-3 text-xs text-nord-blue-light hover:underline"
            >
              Limpar e usar o padrão
            </button>
          )}
        </div>
      )}
    </div>
  );
}
