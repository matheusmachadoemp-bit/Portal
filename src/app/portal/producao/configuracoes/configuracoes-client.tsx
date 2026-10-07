"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, FormError } from "@/components/ui/modal";
import { IconPicker, ColorPicker } from "@/components/ui/icon-picker";
import { DynamicIcon } from "@/components/dynamic-icon";
import { WEEKDAY_LABEL } from "@/lib/producao";
import { NovaCategoriaModal } from "../nova-categoria-modal";

type CategoriaDTO = { id: string; key: string; name: string; color: string; icon: string; active: boolean };
type SetorDTO = { id: string; key: string; name: string; color: string; icon: string; active: boolean };
type WeightDTO = { id: string; weekday: number; percent: number };
type SettingsDTO = { semanasParaMedia: number; toleranciaAlertaPct: number } | null;

const EMPTY_SETOR_FORM = { name: "", color: "#2952E3", icon: "ChefHat" };

export function ConfiguracoesClient({
  categorias: initialCategorias,
  setores: initialSetores,
  settings,
  weights: initialWeights,
  canManage,
}: {
  categorias: CategoriaDTO[];
  setores: SetorDTO[];
  settings: SettingsDTO;
  weights: WeightDTO[];
  canManage: boolean;
}) {
  const [categorias, setCategorias] = useState(initialCategorias);
  const [setores, setSetores] = useState(initialSetores);
  const [weights, setWeights] = useState(
    Array.from({ length: 7 }, (_, weekday) => initialWeights.find((w) => w.weekday === weekday)?.percent ?? 0)
  );
  const [semanasParaMedia, setSemanasParaMedia] = useState(settings?.semanasParaMedia ?? 4);
  const [toleranciaAlertaPct, setToleranciaAlertaPct] = useState(settings?.toleranciaAlertaPct ?? 10);
  const [showCategoriaForm, setShowCategoriaForm] = useState(false);
  const [showSetorForm, setShowSetorForm] = useState(false);
  const [novoSetor, setNovoSetor] = useState(EMPTY_SETOR_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [setorError, setSetorError] = useState<string | null>(null);
  const [savingSetor, setSavingSetor] = useState(false);
  // Mesma proteção contra resposta tardia do POST usada pela criação de
  // categoria (ver nova-categoria-modal.tsx) — conta uma "sessão" do modal
  // de novo setor, incrementada toda vez que ele é fechado, pra uma
  // resposta tardia saber se ainda faz sentido limpar/fechar o formulário
  // atual sem descartar um sucesso nem atrapalhar uma tentativa nova.
  const setorFormSessionRef = useRef(0);

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

  async function criarSetor() {
    if (!novoSetor.name) return;
    setSetorError(null);
    setSavingSetor(true);
    const session = setorFormSessionRef.current;
    try {
      const res = await fetch("/api/producao/setores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoSetor),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (setorFormSessionRef.current === session) {
          setSetorError(data.error ?? "Não foi possível criar o setor.");
        }
        return;
      }
      const data = await res.json();
      // Criado de verdade no servidor — precisa aparecer na lista mesmo que
      // o modal já tenha sido fechado nesse meio-tempo.
      setSetores((s) => [...s, data.setor]);
      if (setorFormSessionRef.current === session) {
        setShowSetorForm(false);
        setNovoSetor(EMPTY_SETOR_FORM);
      }
    } catch {
      if (setorFormSessionRef.current === session) {
        setSetorError("Não foi possível criar o setor.");
      }
    } finally {
      setSavingSetor(false);
    }
  }

  function fecharSetorForm() {
    setorFormSessionRef.current += 1;
    setShowSetorForm(false);
    setSetorError(null);
    setNovoSetor(EMPTY_SETOR_FORM);
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
          {categorias.length === 0 && <p className="text-xs text-nord-gray">Nenhuma categoria cadastrada ainda.</p>}
        </div>
      </Section>

      <Section
        title="Setores de produção"
        action={
          <button
            onClick={() => {
              setSetorError(null);
              setShowSetorForm(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo setor
          </button>
        }
      >
        <p className="text-xs text-nord-gray mb-3">
          Agrupamento por equipe/estação física (ex.: Cozinha Quente, Cozinha Fria) — diferente da categoria, que agrupa
          por tipo de produto.
        </p>
        <div className="flex flex-wrap gap-2">
          {setores.map((s) => (
            <Badge key={s.id} tone="default">
              <span className="flex items-center gap-1.5">
                <DynamicIcon name={s.icon} size={12} style={{ color: s.color }} /> {s.name}
              </span>
            </Badge>
          ))}
          {setores.length === 0 && <p className="text-xs text-nord-gray">Nenhum setor cadastrado ainda.</p>}
        </div>
      </Section>

      {canManage && (
        <>
          <Section title="Peso por dia da semana (usado na previsão)">
            <FormError message={error} />
            <p className="text-xs text-nord-gray mb-3">
              A previsão semanal é distribuída entre os dias segundo esses pesos — a soma precisa dar 100%. Soma atual:{" "}
              <span className={somaPesos === 100 ? "text-nord-success" : "text-nord-warning"}>{somaPesos.toFixed(1)}%</span>
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

      <NovaCategoriaModal
        open={showCategoriaForm}
        onClose={() => setShowCategoriaForm(false)}
        onCreated={(categoria) => setCategorias((c) => [...c, categoria])}
      />

      <Modal open={showSetorForm} onClose={fecharSetorForm} title="Novo setor de produção">
        <div className="space-y-3">
          <FormError message={setorError} />
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              value={novoSetor.name}
              onChange={(e) => setNovoSetor({ ...novoSetor, name: e.target.value })}
              className="input"
              placeholder="Ex.: Cozinha Quente"
            />
          </label>
          <IconPicker value={novoSetor.icon} onChange={(icon) => setNovoSetor({ ...novoSetor, icon })} />
          <ColorPicker value={novoSetor.color} onChange={(color) => setNovoSetor({ ...novoSetor, color })} />
          <button
            onClick={criarSetor}
            disabled={savingSetor}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {savingSetor ? "Criando..." : "Criar setor"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
