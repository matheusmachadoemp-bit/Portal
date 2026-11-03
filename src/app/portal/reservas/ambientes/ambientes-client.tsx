"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";

type EnvironmentDTO = { id: string; name: string; capacity: number; active: boolean; order: number };

type EnvironmentForm = { name: string; capacity: string };
function emptyEnvironmentForm(): EnvironmentForm {
  return { name: "", capacity: "" };
}

/**
 * Ambientes (Etapa 2 do módulo Reservas) — CRUD de ambientes (nome, capacidade total, ativo,
 * ordem). Até a tarefa "reservas-remover-mesas" esta tela se chamava "Mesas e Ambientes" e também
 * cadastrava mesas individuais e combinações de mesas — removidas por completo (ver comentário de
 * redesign em `prisma/schema.prisma` acima de `model ReservationEnvironment`): o motor de
 * disponibilidade agora controla só a capacidade TOTAL do ambiente, sem rastrear mesa nenhuma, e
 * não existe mais nenhum cadastro de mesa/combinação para esta tela mostrar.
 */
export function AmbientesClient({
  canCreate,
  canEdit,
  hasEmpresa,
}: {
  canCreate: boolean;
  canEdit: boolean;
  hasEmpresa: boolean;
}) {
  const [environments, setEnvironments] = useState<EnvironmentDTO[]>([]);
  // Só começa "carregando" se houver loja selecionada — sem empresa ativa, a tela nem tenta
  // buscar nada (ver `if (!hasEmpresa)` no fim deste componente), então o estado inicial já
  // nasce certo em vez de precisar de um `setLoading(false)` síncrono dentro do efeito abaixo.
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<EnvironmentDTO | null>(null);
  const [envForm, setEnvForm] = useState<EnvironmentForm>(emptyEnvironmentForm());
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/reservas/ambientes");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json.error ?? "Não foi possível carregar os ambientes.");
        return;
      }
      setEnvironments(json.environments ?? []);
    } catch {
      setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasEmpresa) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o cadastro no mount
    load();
  }, [hasEmpresa]);

  const sortedEnvironments = [...environments].sort((a, b) => a.order - b.order);

  function openCreateEnv() {
    setEditingEnv(null);
    setEnvForm(emptyEnvironmentForm());
    setEnvError(null);
    setEnvModalOpen(true);
  }
  function openEditEnv(e: EnvironmentDTO) {
    setEditingEnv(e);
    setEnvForm({ name: e.name, capacity: String(e.capacity) });
    setEnvError(null);
    setEnvModalOpen(true);
  }
  async function submitEnv() {
    if (envSaving) return;
    const name = envForm.name.trim();
    const capacity = Number(envForm.capacity);
    if (!name) {
      setEnvError("Informe o nome do ambiente.");
      return;
    }
    if (!Number.isInteger(capacity) || capacity <= 0) {
      setEnvError("Informe uma capacidade válida (inteiro maior que zero).");
      return;
    }
    setEnvSaving(true);
    setEnvError(null);
    try {
      const result = editingEnv
        ? await apiRequest(`/api/reservas/ambientes/${editingEnv.id}`, "PATCH", { name, capacity })
        : await apiRequest("/api/reservas/ambientes", "POST", { name, capacity });
      if (!result.ok) {
        setEnvError(result.error);
        return;
      }
      setEnvModalOpen(false);
      await load();
    } finally {
      setEnvSaving(false);
    }
  }
  async function toggleEnvAtivo(e: EnvironmentDTO) {
    setRowError(null);
    setBusyId(e.id);
    try {
      const result = await apiRequest(`/api/reservas/ambientes/${e.id}`, "PATCH", { active: !e.active });
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }
  async function moveEnv(e: EnvironmentDTO, direction: "up" | "down") {
    const index = sortedEnvironments.findIndex((x) => x.id === e.id);
    const swapWith = direction === "up" ? sortedEnvironments[index - 1] : sortedEnvironments[index + 1];
    if (!swapWith) return;
    setRowError(null);
    setBusyId(e.id);
    try {
      const [r1, r2] = await Promise.all([
        apiRequest(`/api/reservas/ambientes/${e.id}`, "PATCH", { order: swapWith.order }),
        apiRequest(`/api/reservas/ambientes/${swapWith.id}`, "PATCH", { order: e.order }),
      ]);
      if (!r1.ok) {
        setRowError(r1.error);
        return;
      }
      if (!r2.ok) {
        setRowError(r2.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!hasEmpresa) {
    return (
      <Section title="Ambientes">
        <p className="text-sm text-nord-gray">Selecione uma loja específica para ver e editar ambientes.</p>
      </Section>
    );
  }

  if (loading) return <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>;
  if (loadError) return <div className="nord-card p-8 text-center text-sm text-nord-danger">{loadError}</div>;

  return (
    <div className="space-y-6">
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          Seu perfil de permissão só permite visualizar esta tela.
        </p>
      )}

      <FormError message={rowError} />

      <Section
        title="Ambientes"
        action={
          canCreate && (
            <button onClick={openCreateEnv} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <Plus size={13} /> Novo ambiente
            </button>
          )
        }
      >
        <p className="text-xs text-nord-gray mb-3">
          O motor de reservas controla a capacidade TOTAL de cada ambiente — soma quantas pessoas já estão
          reservadas naquele ambiente/horário e compara com a capacidade cadastrada aqui, sem travar a reserva em
          nenhuma mesa específica.
        </p>
        {sortedEnvironments.length === 0 ? (
          <p className="text-sm text-nord-gray py-2">Nenhum ambiente cadastrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {sortedEnvironments.map((e, index) => (
              <div
                key={e.id}
                // `flex-wrap` (+ `gap-y-2` pra dar respiro entre as linhas quando quebra): a 320px
                // o bloco nome+badges, os botões de mover e os de Editar/Desativar não cabiam todos
                // numa linha só e ficavam espremidos — agora podem quebrar em 2 linhas.
                className={`flex items-center flex-wrap gap-x-3 gap-y-2 rounded-lg border p-3 ${e.active ? "border-nord-border/60" : "border-nord-border/30 opacity-60"}`}
              >
                {canEdit && (
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => moveEnv(e, "up")}
                      disabled={busyId !== null || index === 0}
                      title="Mover para cima"
                      className="text-nord-gray hover:text-white disabled:opacity-20"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => moveEnv(e, "down")}
                      disabled={busyId !== null || index === sortedEnvironments.length - 1}
                      title="Mover para baixo"
                      className="text-nord-gray hover:text-white disabled:opacity-20"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium">{e.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge tone="info">Capacidade {e.capacity}</Badge>
                    {!e.active && <Badge tone="warning">Desativado</Badge>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEditEnv(e)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                      <Pencil size={12} /> Editar
                    </button>
                    <button
                      onClick={() => toggleEnvAtivo(e)}
                      disabled={busyId === e.id}
                      className="text-nord-gray hover:text-white text-xs disabled:opacity-50"
                    >
                      {e.active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Modal Ambiente */}
      <Modal open={envModalOpen} onClose={() => setEnvModalOpen(false)} title={editingEnv ? "Editar ambiente" : "Novo ambiente"}>
        <FormError message={envError} />
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              type="text"
              value={envForm.name}
              onChange={(e) => setEnvForm({ ...envForm, name: e.target.value })}
              className="input"
              placeholder="Ex.: Salão principal"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Capacidade total do ambiente</span>
            <input
              type="number"
              min={1}
              value={envForm.capacity}
              onChange={(e) => setEnvForm({ ...envForm, capacity: e.target.value })}
              className="input"
              placeholder="Ex.: 60"
            />
          </label>
          <button
            onClick={submitEnv}
            disabled={envSaving}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {envSaving ? "Salvando..." : editingEnv ? "Salvar alterações" : "Criar ambiente"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
