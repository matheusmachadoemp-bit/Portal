"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, FormError, ConfirmDialog } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import { RESERVATION_TABLE_STATUS_LABEL, RESERVATION_TABLE_STATUSES } from "@/lib/reservas";

type TableStatus = "DISPONIVEL" | "MANUTENCAO" | "INATIVA";

type EnvironmentDTO = { id: string; name: string; capacity: number; active: boolean; order: number; tableCount: number };
type TableDTO = {
  id: string;
  environmentId: string;
  identificacao: string;
  capacityMin: number;
  capacityMax: number;
  status: TableStatus;
  availableForReservation: boolean;
  order: number;
};
type CombinationTableDTO = { id: string; identificacao: string; environmentId: string; capacityMin: number; capacityMax: number };
type CombinationDTO = { id: string; name: string | null; active: boolean; tables: CombinationTableDTO[] };

type EnvironmentForm = { name: string; capacity: string };
function emptyEnvironmentForm(): EnvironmentForm {
  return { name: "", capacity: "" };
}

type TableForm = {
  environmentId: string;
  identificacao: string;
  capacityMin: string;
  capacityMax: string;
  status: TableStatus;
  availableForReservation: boolean;
};
function emptyTableForm(environmentId: string): TableForm {
  return { environmentId, identificacao: "", capacityMin: "", capacityMax: "", status: "DISPONIVEL", availableForReservation: true };
}

type CombinationForm = { environmentId: string; tableIds: string[]; name: string };
function emptyCombinationForm(environmentId: string): CombinationForm {
  return { environmentId, tableIds: [], name: "" };
}

export function MesasAmbientesClient({
  canCreate,
  canEdit,
  canDelete,
  hasEmpresa,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  hasEmpresa: boolean;
}) {
  const [environments, setEnvironments] = useState<EnvironmentDTO[]>([]);
  const [tables, setTables] = useState<TableDTO[]>([]);
  const [combinations, setCombinations] = useState<CombinationDTO[]>([]);
  // Só começa "carregando" se houver loja selecionada — sem empresa ativa, a tela nem tenta
  // buscar nada (ver `if (!hasEmpresa)` no fim deste componente), então o estado inicial já
  // nasce certo em vez de precisar de um `setLoading(false)` síncrono dentro do efeito abaixo.
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Ambiente
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<EnvironmentDTO | null>(null);
  const [envForm, setEnvForm] = useState<EnvironmentForm>(emptyEnvironmentForm());
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  // Mesa
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableDTO | null>(null);
  const [tableForm, setTableForm] = useState<TableForm>(emptyTableForm(""));
  const [tableSaving, setTableSaving] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [deletingTable, setDeletingTable] = useState<TableDTO | null>(null);

  // Combinação
  const [comboModalOpen, setComboModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<CombinationDTO | null>(null);
  const [comboForm, setComboForm] = useState<CombinationForm>(emptyCombinationForm(""));
  const [comboSaving, setComboSaving] = useState(false);
  const [comboError, setComboError] = useState<string | null>(null);
  const [deletingCombo, setDeletingCombo] = useState<CombinationDTO | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [envRes, tableRes, comboRes] = await Promise.all([
        fetch("/api/reservas/ambientes"),
        fetch("/api/reservas/mesas"),
        fetch("/api/reservas/combinacoes"),
      ]);
      const [envJson, tableJson, comboJson] = await Promise.all([
        envRes.json().catch(() => ({})),
        tableRes.json().catch(() => ({})),
        comboRes.json().catch(() => ({})),
      ]);
      if (!envRes.ok) {
        setLoadError(envJson.error ?? "Não foi possível carregar os ambientes.");
        return;
      }
      if (!tableRes.ok) {
        setLoadError(tableJson.error ?? "Não foi possível carregar as mesas.");
        return;
      }
      if (!comboRes.ok) {
        setLoadError(comboJson.error ?? "Não foi possível carregar as combinações de mesas.");
        return;
      }
      setEnvironments(envJson.environments ?? []);
      setTables(tableJson.tables ?? []);
      setCombinations(comboJson.combinations ?? []);
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

  // ---------------------------------------------------------------------
  // Ambiente
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Mesa
  // ---------------------------------------------------------------------
  function openCreateTable(environmentId: string) {
    setEditingTable(null);
    setTableForm(emptyTableForm(environmentId));
    setTableError(null);
    setTableModalOpen(true);
  }
  function openEditTable(t: TableDTO) {
    setEditingTable(t);
    setTableForm({
      environmentId: t.environmentId,
      identificacao: t.identificacao,
      capacityMin: String(t.capacityMin),
      capacityMax: String(t.capacityMax),
      status: t.status,
      availableForReservation: t.availableForReservation,
    });
    setTableError(null);
    setTableModalOpen(true);
  }
  async function submitTable() {
    if (tableSaving) return;
    const identificacao = tableForm.identificacao.trim();
    const capacityMin = Number(tableForm.capacityMin);
    const capacityMax = Number(tableForm.capacityMax);
    if (!identificacao) {
      setTableError("Informe a identificação da mesa (ex.: Mesa 01).");
      return;
    }
    if (!tableForm.environmentId) {
      setTableError("Selecione o ambiente da mesa.");
      return;
    }
    if (!Number.isInteger(capacityMin) || capacityMin <= 0 || !Number.isInteger(capacityMax) || capacityMax <= 0) {
      setTableError("Informe capacidade mínima e máxima válidas (inteiros maiores que zero).");
      return;
    }
    if (capacityMin > capacityMax) {
      setTableError("A capacidade mínima não pode ser maior que a máxima.");
      return;
    }
    setTableSaving(true);
    setTableError(null);
    try {
      const payload = {
        identificacao,
        environmentId: tableForm.environmentId,
        capacityMin,
        capacityMax,
        status: tableForm.status,
        availableForReservation: tableForm.availableForReservation,
      };
      const result = editingTable
        ? await apiRequest(`/api/reservas/mesas/${editingTable.id}`, "PATCH", payload)
        : await apiRequest("/api/reservas/mesas", "POST", payload);
      if (!result.ok) {
        setTableError(result.error);
        return;
      }
      setTableModalOpen(false);
      await load();
    } finally {
      setTableSaving(false);
    }
  }
  async function moveTable(group: TableDTO[], t: TableDTO, direction: "up" | "down") {
    const index = group.findIndex((x) => x.id === t.id);
    const swapWith = direction === "up" ? group[index - 1] : group[index + 1];
    if (!swapWith) return;
    setRowError(null);
    setBusyId(t.id);
    try {
      const [r1, r2] = await Promise.all([
        apiRequest(`/api/reservas/mesas/${t.id}`, "PATCH", { order: swapWith.order }),
        apiRequest(`/api/reservas/mesas/${swapWith.id}`, "PATCH", { order: t.order }),
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
  async function confirmDeleteTable() {
    if (!deletingTable) return;
    setRowError(null);
    setBusyId(deletingTable.id);
    try {
      const result = await apiRequest(`/api/reservas/mesas/${deletingTable.id}`, "DELETE");
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
      setDeletingTable(null);
    }
  }

  // ---------------------------------------------------------------------
  // Combinação
  // ---------------------------------------------------------------------
  function openCreateCombo(environmentId: string) {
    setEditingCombo(null);
    setComboForm(emptyCombinationForm(environmentId));
    setComboError(null);
    setComboModalOpen(true);
  }
  function openEditCombo(c: CombinationDTO) {
    setEditingCombo(c);
    setComboForm({ environmentId: c.tables[0]?.environmentId ?? "", tableIds: c.tables.map((t) => t.id), name: c.name ?? "" });
    setComboError(null);
    setComboModalOpen(true);
  }
  function toggleComboTable(tableId: string) {
    setComboForm((f) => ({
      ...f,
      tableIds: f.tableIds.includes(tableId) ? f.tableIds.filter((id) => id !== tableId) : [...f.tableIds, tableId],
    }));
  }
  async function submitCombo() {
    if (comboSaving) return;
    if (comboForm.tableIds.length < 2) {
      setComboError("Selecione ao menos 2 mesas para formar uma combinação.");
      return;
    }
    setComboSaving(true);
    setComboError(null);
    try {
      const payload = { tableIds: comboForm.tableIds, name: comboForm.name.trim() || undefined };
      const result = editingCombo
        ? await apiRequest(`/api/reservas/combinacoes/${editingCombo.id}`, "PATCH", payload)
        : await apiRequest("/api/reservas/combinacoes", "POST", payload);
      if (!result.ok) {
        setComboError(result.error);
        return;
      }
      setComboModalOpen(false);
      await load();
    } finally {
      setComboSaving(false);
    }
  }
  async function toggleComboAtivo(c: CombinationDTO) {
    setRowError(null);
    setBusyId(c.id);
    try {
      const result = await apiRequest(`/api/reservas/combinacoes/${c.id}`, "PATCH", { active: !c.active });
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }
  async function confirmDeleteCombo() {
    if (!deletingCombo) return;
    setRowError(null);
    setBusyId(deletingCombo.id);
    try {
      const result = await apiRequest(`/api/reservas/combinacoes/${deletingCombo.id}`, "DELETE");
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
      setDeletingCombo(null);
    }
  }

  if (!hasEmpresa) {
    return (
      <Section title="Mesas e Ambientes">
        <p className="text-sm text-nord-gray">Selecione uma loja específica para ver e editar mesas e ambientes.</p>
      </Section>
    );
  }

  if (loading) return <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>;
  if (loadError) return <div className="nord-card p-8 text-center text-sm text-nord-danger">{loadError}</div>;

  const tablesByEnvironment = (environmentId: string) =>
    tables.filter((t) => t.environmentId === environmentId).sort((a, b) => a.order - b.order);

  const comboFormTables = tables.filter((t) => t.environmentId === comboForm.environmentId);

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
        {sortedEnvironments.length === 0 ? (
          <p className="text-sm text-nord-gray py-2">Nenhum ambiente cadastrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {sortedEnvironments.map((e, index) => (
              <div
                key={e.id}
                className={`flex items-center gap-3 rounded-lg border p-3 ${e.active ? "border-nord-border/60" : "border-nord-border/30 opacity-60"}`}
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
                    <Badge tone="default">
                      {e.tableCount} {e.tableCount === 1 ? "mesa" : "mesas"}
                    </Badge>
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

      <Section title="Mesas">
        {sortedEnvironments.length === 0 ? (
          <p className="text-sm text-nord-gray py-2">Cadastre um ambiente antes de criar mesas.</p>
        ) : (
          <div className="space-y-5">
            {sortedEnvironments.map((env) => {
              const group = tablesByEnvironment(env.id);
              return (
                <div key={env.id}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-nord-gray uppercase tracking-wide">{env.name}</h4>
                    {canCreate && (
                      <button
                        onClick={() => openCreateTable(env.id)}
                        className="flex items-center gap-1 text-xs text-nord-blue-light hover:text-white"
                      >
                        <Plus size={12} /> Nova mesa
                      </button>
                    )}
                  </div>
                  {group.length === 0 ? (
                    <p className="text-sm text-nord-gray py-1">Nenhuma mesa cadastrada neste ambiente.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {group.map((t, index) => (
                        <div
                          key={t.id}
                          className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                            t.status === "INATIVA" ? "border-nord-border/30 opacity-60" : "border-nord-border/60"
                          }`}
                        >
                          {canEdit && (
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                onClick={() => moveTable(group, t, "up")}
                                disabled={busyId !== null || index === 0}
                                title="Mover para cima"
                                className="text-nord-gray hover:text-white disabled:opacity-20"
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                onClick={() => moveTable(group, t, "down")}
                                disabled={busyId !== null || index === group.length - 1}
                                title="Mover para baixo"
                                className="text-nord-gray hover:text-white disabled:opacity-20"
                              >
                                <ChevronDown size={13} />
                              </button>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white font-medium">{t.identificacao}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <Badge tone="default">
                                {t.capacityMin}–{t.capacityMax} pessoas
                              </Badge>
                              <Badge tone={t.status === "DISPONIVEL" ? "success" : t.status === "MANUTENCAO" ? "warning" : "danger"}>
                                {RESERVATION_TABLE_STATUS_LABEL[t.status]}
                              </Badge>
                              {!t.availableForReservation && <Badge tone="warning">Fora da oferta de reservas</Badge>}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => openEditTable(t)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                                <Pencil size={12} /> Editar
                              </button>
                              {canDelete && (
                                <button
                                  onClick={() => setDeletingTable(t)}
                                  disabled={busyId === t.id}
                                  className="text-nord-gray hover:text-nord-danger disabled:opacity-50"
                                  title="Excluir mesa"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Combinações de mesas"
        action={
          canCreate &&
          tables.length >= 2 && (
            <button
              onClick={() => openCreateCombo(sortedEnvironments[0]?.id ?? "")}
              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <Plus size={13} /> Nova combinação
            </button>
          )
        }
      >
        <p className="text-xs text-nord-gray mb-3">
          Conjuntos de mesas do mesmo ambiente que podem ser combinados para atender grupos maiores — o sistema só
          sugere uma combinação quando TODAS as suas mesas estiverem livres no horário pedido.
        </p>
        {combinations.length === 0 ? (
          <p className="text-sm text-nord-gray py-2">Nenhuma combinação cadastrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {combinations.map((c) => {
              const capacityMin = c.tables.reduce((sum, t) => sum + t.capacityMin, 0);
              const capacityMax = c.tables.reduce((sum, t) => sum + t.capacityMax, 0);
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${c.active ? "border-nord-border/60" : "border-nord-border/30 opacity-60"}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium">
                      {c.name ?? c.tables.map((t) => t.identificacao).join(" + ")}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge tone="default">{c.tables.map((t) => t.identificacao).join(" + ")}</Badge>
                      <Badge tone="info">
                        {capacityMin}–{capacityMax} pessoas
                      </Badge>
                      {!c.active && <Badge tone="warning">Desativada</Badge>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => openEditCombo(c)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        onClick={() => toggleComboAtivo(c)}
                        disabled={busyId === c.id}
                        className="text-nord-gray hover:text-white text-xs disabled:opacity-50"
                      >
                        {c.active ? "Desativar" : "Ativar"}
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setDeletingCombo(c)}
                          disabled={busyId === c.id}
                          className="text-nord-gray hover:text-nord-danger disabled:opacity-50"
                          title="Excluir combinação"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
            <span className="block text-xs text-nord-gray mb-1">Capacidade do ambiente</span>
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

      {/* Modal Mesa */}
      <Modal open={tableModalOpen} onClose={() => setTableModalOpen(false)} title={editingTable ? "Editar mesa" : "Nova mesa"}>
        <FormError message={tableError} />
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Identificação</span>
            <input
              type="text"
              value={tableForm.identificacao}
              onChange={(e) => setTableForm({ ...tableForm, identificacao: e.target.value })}
              className="input"
              placeholder="Ex.: Mesa 01"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ambiente</span>
            <select
              value={tableForm.environmentId}
              onChange={(e) => setTableForm({ ...tableForm, environmentId: e.target.value })}
              className="input"
            >
              <option value="" disabled>
                Selecione...
              </option>
              {sortedEnvironments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Capacidade mínima</span>
              <input
                type="number"
                min={1}
                value={tableForm.capacityMin}
                onChange={(e) => setTableForm({ ...tableForm, capacityMin: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Capacidade máxima</span>
              <input
                type="number"
                min={1}
                value={tableForm.capacityMax}
                onChange={(e) => setTableForm({ ...tableForm, capacityMax: e.target.value })}
                className="input"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Status operacional</span>
            <select
              value={tableForm.status}
              onChange={(e) => setTableForm({ ...tableForm, status: e.target.value as TableStatus })}
              className="input"
            >
              {RESERVATION_TABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RESERVATION_TABLE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={tableForm.availableForReservation}
              onChange={(e) => setTableForm({ ...tableForm, availableForReservation: e.target.checked })}
            />
            <span className="text-sm text-white">Disponível para reservas</span>
          </label>
          <p className="text-[11px] text-nord-gray">
            Desmarque esta opção para manter a mesa cadastrada e em uso normal no salão, mas fora da oferta de
            reservas temporariamente (ex.: reservada para uso exclusivo de clientes sem reserva num evento).
          </p>
          <button
            onClick={submitTable}
            disabled={tableSaving}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {tableSaving ? "Salvando..." : editingTable ? "Salvar alterações" : "Criar mesa"}
          </button>
        </div>
      </Modal>

      {/* Modal Combinação */}
      <Modal
        open={comboModalOpen}
        onClose={() => setComboModalOpen(false)}
        title={editingCombo ? "Editar combinação de mesas" : "Nova combinação de mesas"}
      >
        <FormError message={comboError} />
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ambiente</span>
            <select
              value={comboForm.environmentId}
              onChange={(e) => setComboForm({ ...comboForm, environmentId: e.target.value, tableIds: [] })}
              className="input"
              disabled={!!editingCombo}
            >
              <option value="" disabled>
                Selecione...
              </option>
              {sortedEnvironments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="block text-xs text-nord-gray mb-1">Mesas (selecione ao menos 2, do mesmo ambiente)</span>
            {comboFormTables.length === 0 ? (
              <p className="text-sm text-nord-gray py-1">Nenhuma mesa cadastrada neste ambiente.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {comboFormTables.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm text-white">
                    <input type="checkbox" checked={comboForm.tableIds.includes(t.id)} onChange={() => toggleComboTable(t.id)} />
                    {t.identificacao} ({t.capacityMin}–{t.capacityMax} pessoas)
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome (opcional)</span>
            <input
              type="text"
              value={comboForm.name}
              onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })}
              className="input"
              placeholder="Se vazio, usa os nomes das mesas (ex.: Mesa 01 + Mesa 02)"
            />
          </label>
          <button
            onClick={submitCombo}
            disabled={comboSaving}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {comboSaving ? "Salvando..." : editingCombo ? "Salvar alterações" : "Criar combinação"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingTable}
        title="Excluir mesa"
        message={`Tem certeza que deseja excluir a mesa "${deletingTable?.identificacao}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        onConfirm={confirmDeleteTable}
        onCancel={() => setDeletingTable(null)}
      />
      <ConfirmDialog
        open={!!deletingCombo}
        title="Excluir combinação"
        message="Tem certeza que deseja excluir esta combinação de mesas? As mesas em si não são afetadas."
        confirmLabel="Excluir"
        danger
        onConfirm={confirmDeleteCombo}
        onCancel={() => setDeletingCombo(null)}
      />
    </div>
  );
}
