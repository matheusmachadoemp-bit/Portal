"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, FormError } from "@/components/ui/modal";
import { IconPicker, ColorPicker } from "@/components/ui/icon-picker";
import { DynamicIcon } from "@/components/dynamic-icon";
import { WEEKDAY_LABEL } from "@/lib/producao";

type CategoriaDTO = { id: string; key: string; name: string; color: string; icon: string; active: boolean };
type WeightDTO = { id: string; weekday: number; percent: number };
type SettingsDTO = { semanasParaMedia: number; toleranciaAlertaPct: number } | null;

export function ConfiguracoesClient({
  categorias: initialCategorias,
  settings,
  weights: initialWeights,
  canManage,
}: {
  categorias: CategoriaDTO[];
  settings: SettingsDTO;
  weights: WeightDTO[];
  canManage: boolean;
}) {
  const [categorias, setCategorias] = useState(initialCategorias);
  const [weights, setWeights] = useState(
    Array.from({ length: 7 }, (_, weekday) => initialWeights.find((w) => w.weekday === weekday)?.percent ?? 0)
  );
  const [semanasParaMedia, setSemanasParaMedia] = useState(settings?.semanasParaMedia ?? 4);
  const [toleranciaAlertaPct, setToleranciaAlertaPct] = useState(settings?.toleranciaAlertaPct ?? 10);
  const [showCategoriaForm, setShowCategoriaForm] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState({ key: "", name: "", color: "#2952E3", icon: "ChefHat" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const somaPesos = weights.reduce((a, b) => a + b, 0);

  async function salvarConfiguracoes() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/producao/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semanasParaMedia,
          toleranciaAlertaPct,
          weights: weights.map((percent, weekday) => ({ weekday, percent })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Não foi possível salvar as configurações.");
        return;
      }
    } finally {
      setSaving(false);
    }
  }

  async function criarCategoria() {
    if (!novaCategoria.key || !novaCategoria.name) return;
    const res = await fetch("/api/producao/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novaCategoria),
    });
    if (res.ok) {
      const data = await res.json();
      setCategorias((c) => [...c, data.categoria]);
      setShowCategoriaForm(false);
      setNovaCategoria({ key: "", name: "", color: "#2952E3", icon: "ChefHat" });
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Categorias de produção"
        action={
          <button
            onClick={() => setShowCategoriaForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova categoria
          </button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {categorias.map((c) => (
            <Badge key={c.id} tone="default">
              <span className="flex items-center gap-1.5">
                <DynamicIcon name={c.icon} size={12} style={{ color: c.color }} /> {c.name}
              </span>
            </Badge>
          ))}
        </div>
      </Section>

      {canManage && (
        <>
          <Section title="Peso por dia da semana (usado na previsão)">
            <FormError message={error} />
            <p className="text-xs text-nord-gray mb-3">
              A previsão semanal é distribuída entre os dias segundo esses pesos — a soma precisa dar 100%. Soma atual:{" "}
              <span className={somaPesos === 100 ? "text-emerald-400" : "text-amber-400"}>{somaPesos.toFixed(1)}%</span>
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {weights.map((percent, weekday) => (
                <label key={weekday} className="block">
                  <span className="block text-[11px] text-nord-gray mb-1">{WEEKDAY_LABEL[weekday]}</span>
                  <input
                    value={percent}
                    onChange={(e) => {
                      const value = Number(e.target.value) || 0;
                      setWeights((w) => w.map((p, i) => (i === weekday ? value : p)));
                    }}
                    className="input text-center"
                  />
                </label>
              ))}
            </div>
          </Section>

          <Section title="Previsão e alertas">
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Semanas usadas na média</span>
                <input value={semanasParaMedia} onChange={(e) => setSemanasParaMedia(Number(e.target.value) || 1)} className="input" />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Tolerância de alerta (%)</span>
                <input value={toleranciaAlertaPct} onChange={(e) => setToleranciaAlertaPct(Number(e.target.value) || 0)} className="input" />
              </label>
            </div>
            <button
              onClick={salvarConfiguracoes}
              disabled={saving}
              className="mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
            >
              {saving ? "Salvando..." : "Salvar configurações"}
            </button>
          </Section>
        </>
      )}

      <Modal open={showCategoriaForm} onClose={() => setShowCategoriaForm(false)} title="Nova categoria de produção">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              value={novaCategoria.name}
              onChange={(e) => setNovaCategoria({ ...novaCategoria, name: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-") })}
              className="input"
            />
          </label>
          <IconPicker value={novaCategoria.icon} onChange={(icon) => setNovaCategoria({ ...novaCategoria, icon })} />
          <ColorPicker value={novaCategoria.color} onChange={(color) => setNovaCategoria({ ...novaCategoria, color })} />
          <button onClick={criarCategoria} className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
            Criar categoria
          </button>
        </div>
      </Modal>
    </div>
  );
}
