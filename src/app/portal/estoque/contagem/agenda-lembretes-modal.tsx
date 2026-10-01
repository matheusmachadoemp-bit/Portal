"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";

type ScheduleRow = {
  id: string;
  setor: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  horario: string;
  segunda: boolean;
  terca: boolean;
  quarta: boolean;
  quinta: boolean;
  sexta: boolean;
  sabado: boolean;
  domingo: boolean;
  active: boolean;
};

const WEEKDAY_FIELDS = [
  { key: "segunda", label: "Seg" },
  { key: "terca", label: "Ter" },
  { key: "quarta", label: "Qua" },
  { key: "quinta", label: "Qui" },
  { key: "sexta", label: "Sex" },
  { key: "sabado", label: "Sáb" },
  { key: "domingo", label: "Dom" },
] as const;

type WeekdayKey = (typeof WEEKDAY_FIELDS)[number]["key"];

type FormState = { setor: string; responsavelId: string; horario: string } & Record<WeekdayKey, boolean>;

const emptyForm: FormState = {
  setor: "",
  responsavelId: "",
  horario: "09:00",
  segunda: true,
  terca: true,
  quarta: true,
  quinta: true,
  sexta: true,
  sabado: true,
  domingo: true,
};

function diasResumo(s: ScheduleRow): string {
  const marcados = WEEKDAY_FIELDS.filter((d) => s[d.key]);
  if (marcados.length === 7) return "Todos os dias";
  if (marcados.length === 0) return "Nenhum dia";
  return marcados.map((d) => d.label).join(", ");
}

/**
 * Botão "Lembretes" + modal de configuração da agenda de notificação de contagem (dias da semana
 * + horário + setor/responsável opcionais) — usado tanto por `ContagemSemanalClient` quanto por
 * `ContagemMensalClient`, um pra cada `type` de StockCountSchedule (ver schema.prisma). Só agenda
 * a notificação (disparada pelo cron em GET /api/estoque/contagens/lembretes/run); não cria a
 * StockCount automaticamente.
 */
export function AgendaLembretesModal({
  type,
  typeLabel,
  setores,
  users,
  canCreate,
  canManage,
}: {
  type: "SEMANAL" | "MENSAL";
  typeLabel: string;
  setores: string[];
  users: { id: string; name: string }[];
  canCreate: boolean;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque/contagens/agenda");
      const data = await res.json();
      const all = (data.schedules ?? []) as Record<string, unknown>[];
      setSchedules(
        all
          .filter((s) => s.type === type)
          .map((s) => ({
            id: s.id as string,
            setor: s.setor as string | null,
            responsavelId: s.responsavelId as string | null,
            responsavelNome: (s.responsavel as { name: string } | null)?.name ?? null,
            horario: s.horario as string,
            segunda: s.segunda as boolean,
            terca: s.terca as boolean,
            quarta: s.quarta as boolean,
            quinta: s.quinta as boolean,
            sexta: s.sexta as boolean,
            sabado: s.sabado as boolean,
            domingo: s.domingo as boolean,
            active: s.active as boolean,
          }))
      );
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a lista ao abrir o modal
    refresh();
  }, [open, refresh]);

  async function submit() {
    if (submitting || !canCreate) return;
    const algumDia = WEEKDAY_FIELDS.some((d) => form[d.key]);
    if (!algumDia) {
      setError("Marque ao menos um dia da semana.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/estoque/contagens/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...form, setor: form.setor || undefined, responsavelId: form.responsavelId || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível criar o lembrete.");
        return;
      }
      setForm(emptyForm);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(s: ScheduleRow) {
    if (!canManage) return;
    await fetch(`/api/estoque/contagens/agenda/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const res = await fetch(`/api/estoque/contagens/agenda/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Não foi possível excluir o lembrete.");
      return;
    }
    setDeleteError(null);
    refresh();
  }

  if (!canManage) return null;

  return (
    <>
      <button className="btn-outline" onClick={() => setOpen(true)}>
        <Bell size={13} /> Lembretes
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Lembretes de contagem — ${typeLabel}`} widthClass="max-w-2xl">
        <div className="space-y-5">
          {canCreate && (
            <div className="nord-card p-4 space-y-3">
              <span className="block text-sm font-medium text-white">Novo lembrete</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Setor</span>
                  <select className="input" value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}>
                    <option value="">Todos os setores</option>
                    {setores.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Responsável (recebe a notificação)</span>
                  <select className="input" value={form.responsavelId} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })}>
                    <option value="">Sem responsável definido</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Horário</span>
                  <input
                    className="input"
                    type="time"
                    value={form.horario}
                    onChange={(e) => setForm({ ...form, horario: e.target.value })}
                  />
                </label>
              </div>
              <div>
                <span className="block text-xs text-nord-gray mb-2">Dias da semana</span>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_FIELDS.map((d) => (
                    <label
                      key={d.key}
                      className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border ${
                        form[d.key] ? "bg-nord-blue border-nord-blue text-white" : "border-nord-border text-nord-gray"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form[d.key]}
                        onChange={(e) => setForm({ ...form, [d.key]: e.target.checked })}
                        className="hidden"
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>
              {error && <p className="text-xs text-nord-danger">{error}</p>}
              <button onClick={submit} disabled={submitting} className="btn-primary w-full py-2">
                {submitting ? "Salvando..." : "Adicionar lembrete"}
              </button>
            </div>
          )}

          {deleteError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-nord-danger/10 border border-nord-danger/30">
              <AlertTriangle size={14} className="text-nord-danger mt-0.5 shrink-0" />
              <p className="text-xs text-nord-danger">{deleteError}</p>
            </div>
          )}

          <div>
            <span className="block text-sm font-medium text-white mb-2">Lembretes configurados</span>
            {loading ? (
              <p className="text-sm text-nord-gray text-center py-4">Carregando...</p>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-nord-gray text-center py-4">Nenhum lembrete configurado para a contagem {typeLabel.toLowerCase()}.</p>
            ) : (
              <div className="space-y-2">
                {schedules.map((s) => (
                  <div key={s.id} className={`nord-card p-3 flex items-center justify-between gap-3 ${!s.active ? "opacity-50" : ""}`}>
                    <div className="text-xs space-y-0.5">
                      <div className="text-white font-medium">
                        {s.setor ?? "Todos os setores"} — {s.horario}
                      </div>
                      <div className="text-nord-gray">
                        {diasResumo(s)} · {s.responsavelNome ?? "Sem responsável definido"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge tone={s.active ? "success" : "default"}>{s.active ? "Ativo" : "Inativo"}</Badge>
                      {canManage && (
                        <>
                          <button onClick={() => toggleActive(s)} className="text-[11px] text-nord-blue-light hover:underline">
                            {s.active ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            onClick={() => { setDeleteError(null); setConfirmDeleteId(s.id); }}
                            className="text-[11px] text-nord-danger hover:underline"
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir lembrete"
        message="Tem certeza que deseja excluir este lembrete de contagem? Ele deixará de notificar o responsável nos dias/horário configurados."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />
    </>
  );
}
