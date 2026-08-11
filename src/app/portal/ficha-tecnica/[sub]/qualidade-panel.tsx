"use client";

import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { Section, StatCard, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatPercent } from "@/lib/calc";
import { cmvPercent, productTotalCost } from "@/lib/ficha";
import { differenceInCalendarDays } from "date-fns";

type ProductForQuality = {
  id: string;
  name: string;
  precoVenda: number;
  description: string | null;
  updatedAt: string;
  ingredients: { quantidadeUsada: number; percentualPerda: number; ingredient: { precoAtual: number; quantidadeEmbalagem: number } }[];
};

export function QualidadePanel({
  products,
  category,
  initialConfig,
  canEdit,
}: {
  products: ProductForQuality[];
  category: string;
  initialConfig: { cmvMaximoPercent: number; diasDesatualizada: number };
  canEdit: boolean;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [showConfig, setShowConfig] = useState(false);
  const [form, setForm] = useState({ cmvMaximoPercent: String(initialConfig.cmvMaximoPercent), diasDesatualizada: String(initialConfig.diasDesatualizada) });
  const [openBucket, setOpenBucket] = useState<"desatualizadas" | "incompletas" | "cmvAlto" | "ok" | null>(null);

  const evaluated = useMemo(() => {
    const now = new Date();
    return products.map((p) => {
      const totalCost = productTotalCost(p.ingredients);
      const cmv = cmvPercent(totalCost, p.precoVenda);
      const daysSinceUpdate = differenceInCalendarDays(now, new Date(p.updatedAt));
      const desatualizada = daysSinceUpdate > config.diasDesatualizada;
      const incompleta = p.ingredients.length === 0 || p.precoVenda <= 0 || !p.description;
      const cmvAlto = cmv > config.cmvMaximoPercent;
      return { ...p, cmv, desatualizada, incompleta, cmvAlto, daysSinceUpdate };
    });
  }, [products, config]);

  const buckets = {
    desatualizadas: evaluated.filter((p) => p.desatualizada),
    incompletas: evaluated.filter((p) => p.incompleta),
    cmvAlto: evaluated.filter((p) => p.cmvAlto),
    ok: evaluated.filter((p) => !p.desatualizada && !p.incompleta && !p.cmvAlto),
  };

  const total = products.length;

  async function saveConfig() {
    const res = await fetch("/api/ficha-tecnica/qualidade", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, cmvMaximoPercent: form.cmvMaximoPercent, diasDesatualizada: form.diasDesatualizada }),
    });
    if (res.ok) {
      setConfig({ cmvMaximoPercent: Number(form.cmvMaximoPercent), diasDesatualizada: Number(form.diasDesatualizada) });
      setShowConfig(false);
    }
  }

  if (total === 0) return null;

  return (
    <Section
      title="Painel de qualidade das fichas"
      action={
        canEdit ? (
          <button onClick={() => setShowConfig(true)} className="flex items-center gap-1.5 text-xs text-nord-gray hover:text-white">
            <Settings2 size={13} /> Configurar padrões
          </button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => setOpenBucket("desatualizadas")} className="text-left">
          <StatCard
            label={`Desatualizadas há mais de ${config.diasDesatualizada} dias`}
            value={`${buckets.desatualizadas.length} de ${total}`}
            icon="Clock"
            color="#ef4444"
          />
        </button>
        <button onClick={() => setOpenBucket("incompletas")} className="text-left">
          <StatCard label="Fichas incompletas" value={`${buckets.incompletas.length} de ${total}`} icon="AlertTriangle" color="#f59e0b" />
        </button>
        <button onClick={() => setOpenBucket("cmvAlto")} className="text-left">
          <StatCard
            label={`CMV acima do padrão (${formatPercent(config.cmvMaximoPercent, 0)})`}
            value={`${buckets.cmvAlto.length} de ${total}`}
            icon="TrendingUp"
            color="#ef4444"
          />
        </button>
        <button onClick={() => setOpenBucket("ok")} className="text-left">
          <StatCard label="Fichas OK" value={`${buckets.ok.length} de ${total}`} icon="CheckCircle2" color="#22c55e" />
        </button>
      </div>

      <Modal
        open={!!openBucket}
        onClose={() => setOpenBucket(null)}
        title={
          openBucket === "desatualizadas"
            ? "Fichas desatualizadas"
            : openBucket === "incompletas"
              ? "Fichas incompletas"
              : openBucket === "cmvAlto"
                ? "CMV acima do padrão"
                : "Fichas OK"
        }
        widthClass="max-w-lg"
      >
        <div className="space-y-2">
          {openBucket &&
            buckets[openBucket].map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
                <span className="text-white">{p.name}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={p.cmvAlto ? "danger" : "default"}>CMV {formatPercent(p.cmv)}</Badge>
                  {p.desatualizada && <Badge tone="warning">{p.daysSinceUpdate}d sem atualizar</Badge>}
                  {p.incompleta && <Badge tone="warning">Incompleta</Badge>}
                </div>
              </div>
            ))}
          {openBucket && buckets[openBucket].length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum produto nesta condição.</p>}
        </div>
      </Modal>

      <Modal open={showConfig} onClose={() => setShowConfig(false)} title="Configurar padrões de qualidade" widthClass="max-w-sm">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Dias para considerar desatualizada</span>
            <input
              type="number"
              value={form.diasDesatualizada}
              onChange={(e) => setForm({ ...form, diasDesatualizada: e.target.value })}
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">CMV máximo recomendado (%)</span>
            <input
              type="number"
              value={form.cmvMaximoPercent}
              onChange={(e) => setForm({ ...form, cmvMaximoPercent: e.target.value })}
              className="input"
            />
          </label>
          <button onClick={saveConfig} className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
            Salvar
          </button>
        </div>
      </Modal>

      <style jsx global>{`
        .input {
          width: 100%;
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </Section>
  );
}
