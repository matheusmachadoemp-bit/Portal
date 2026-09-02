"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Search, Eye, Upload } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber, formatPercent } from "@/lib/calc";
import { tempoDeEmpresa } from "@/lib/rh-helpers";
import { format } from "date-fns";
import { RhTabs } from "../rh-tabs";

type EmployeeDTO = {
  id: string;
  name: string;
  cargo: string;
  setor: string;
  photoUrl: string | null;
  admissionDate: string;
  terminationDate: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  pixKey: string | null;
  birthDate: string | null;
  escala: string | null;
  gestorResponsavel: string | null;
  supervisorResponsavel: string | null;
  salarioFixo: number | null;
  lastEvaluationDate: string | null;
  lastEvaluationNote: string | null;
  lastTrainingDate: string | null;
  lastTrainingName: string | null;
  empresa: { name: string };
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  ATIVO: "success",
  FERIAS: "info",
  AFASTADO: "warning",
  DESLIGADO: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  ATIVO: "Ativo",
  FERIAS: "Férias",
  AFASTADO: "Afastado",
  DESLIGADO: "Desligado",
};

const emptyForm = {
  name: "",
  cargo: "",
  setor: "",
  admissionDate: format(new Date(), "yyyy-MM-dd"),
  status: "ATIVO",
  phone: "",
  email: "",
  cpf: "",
  pixKey: "",
  birthDate: "",
  escala: "",
  gestorResponsavel: "",
  supervisorResponsavel: "",
  salarioFixo: "",
  lastEvaluationDate: "",
  lastEvaluationNote: "",
  lastTrainingDate: "",
  lastTrainingName: "",
};

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-nord-blue/20 text-nord-blue text-xs font-semibold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

export function ColaboradoresClient({
  initialEmployees,
  turnover,
  desligamentos,
  quadroMedio,
  totalOcorrencias,
  canCreate = true,
  showLoja = false,
}: {
  initialEmployees: EmployeeDTO[];
  turnover: number;
  desligamentos: number;
  quadroMedio: number;
  totalOcorrencias: number;
  canCreate?: boolean;
  showLoja?: boolean;
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EmployeeDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [filterLoja, setFilterLoja] = useState("");
  const [filterCargo, setFilterCargo] = useState("");
  const [filterSetor, setFilterSetor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAdmissaoDe, setFilterAdmissaoDe] = useState("");
  const [filterAdmissaoAte, setFilterAdmissaoAte] = useState("");

  const lojas = useMemo(() => [...new Set(employees.map((e) => e.empresa.name))].sort(), [employees]);
  const cargos = useMemo(() => [...new Set(employees.map((e) => e.cargo))].filter(Boolean).sort(), [employees]);
  const setores = useMemo(() => [...new Set(employees.map((e) => e.setor))].filter(Boolean).sort(), [employees]);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterLoja && e.empresa.name !== filterLoja) return false;
      if (filterCargo && e.cargo !== filterCargo) return false;
      if (filterSetor && e.setor !== filterSetor) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterAdmissaoDe && e.admissionDate < filterAdmissaoDe) return false;
      if (filterAdmissaoAte && e.admissionDate > filterAdmissaoAte) return false;
      return true;
    });
  }, [employees, search, filterLoja, filterCargo, filterSetor, filterStatus, filterAdmissaoDe, filterAdmissaoAte]);

  async function refresh() {
    const res = await fetch("/api/rh/employees");
    const data = await res.json();
    setEmployees(data.employees);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(e: EmployeeDTO) {
    setEditing(e);
    setForm({
      name: e.name,
      cargo: e.cargo,
      setor: e.setor,
      admissionDate: format(new Date(e.admissionDate), "yyyy-MM-dd"),
      status: e.status,
      phone: e.phone ?? "",
      email: e.email ?? "",
      cpf: e.cpf ?? "",
      pixKey: e.pixKey ?? "",
      birthDate: e.birthDate ? format(new Date(e.birthDate), "yyyy-MM-dd") : "",
      escala: e.escala ?? "",
      gestorResponsavel: e.gestorResponsavel ?? "",
      supervisorResponsavel: e.supervisorResponsavel ?? "",
      salarioFixo: e.salarioFixo !== null ? String(e.salarioFixo) : "",
      lastEvaluationDate: e.lastEvaluationDate ? format(new Date(e.lastEvaluationDate), "yyyy-MM-dd") : "",
      lastEvaluationNote: e.lastEvaluationNote ?? "",
      lastTrainingDate: e.lastTrainingDate ? format(new Date(e.lastTrainingDate), "yyyy-MM-dd") : "",
      lastTrainingName: e.lastTrainingName ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/rh/employees/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/rh/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/rh/employees/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/rh/employees/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        refresh();
      } else {
        setImportResult({ imported: 0, errors: [data.error ?? "Erro ao importar."] });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="rh-colaboradores-kpi-order"
        className="grid grid-cols-2 md:grid-cols-5 gap-4"
        cards={[
          { key: "colaboradores-ativos", label: "Colaboradores ativos", value: formatNumber(employees.filter((e) => e.status === "ATIVO").length), icon: "Users" },
          { key: "turnover-mes", label: "Turnover (mês)", value: formatPercent(turnover), icon: "Repeat", color: "#ef4444" },
          { key: "quadro-medio", label: "Quadro médio", value: formatNumber(quadroMedio, 1), icon: "UsersRound" },
          { key: "desligamentos-mes", label: "Desligamentos (mês)", value: formatNumber(desligamentos), icon: "UserX", color: "#ef4444" },
          { key: "ocorrencias-mes", label: "Ocorrências no mês", value: formatNumber(totalOcorrencias), icon: "AlertTriangle", color: "#eab308" },
        ]}
      />

      <div className="flex items-center justify-between">
        <RhTabs />
        {canCreate && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.xlsx"
              className="hidden"
              id="colaboradores-upload"
              onChange={handleFileChange}
            />
            <label
              htmlFor="colaboradores-upload"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white cursor-pointer"
            >
              <Upload size={13} /> {uploading ? "Enviando..." : "Importar"}
            </label>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Novo colaborador
            </button>
          </div>
        )}
      </div>
      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          cadastrar ou editar colaboradores.
        </p>
      )}
      {importResult && (
        <div
          className={`text-xs rounded-lg px-3 py-2 border ${
            importResult.errors.length > 0
              ? "bg-amber-950/20 border-amber-900/40 text-amber-400"
              : "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
          }`}
        >
          <p>{importResult.imported} colaborador(es) importado(s).</p>
          {importResult.errors.slice(0, 8).map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      <div className="nord-card p-4 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nord-gray" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="input pl-8"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {showLoja && (
            <select value={filterLoja} onChange={(e) => setFilterLoja(e.target.value)} className="input">
              <option value="">Todas as lojas</option>
              {lojas.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
          <select value={filterCargo} onChange={(e) => setFilterCargo(e.target.value)} className="input">
            <option value="">Todos os cargos</option>
            {cargos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={filterSetor} onChange={(e) => setFilterSetor(e.target.value)} className="input">
            <option value="">Todos os setores</option>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input type="date" value={filterAdmissaoDe} onChange={(e) => setFilterAdmissaoDe(e.target.value)} className="input" title="Admissão de" />
          <input type="date" value={filterAdmissaoAte} onChange={(e) => setFilterAdmissaoAte(e.target.value)} className="input" title="Admissão até" />
        </div>
      </div>

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-3 px-4">Colaborador</th>
              <th className="py-3 px-4">Cargo</th>
              <th className="py-3 px-4">Loja</th>
              <th className="py-3 px-4">Admissão</th>
              <th className="py-3 px-4">Tempo de empresa</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 px-4 text-white">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={e.name} photoUrl={e.photoUrl} />
                    <span>{e.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-4 text-nord-gray">{e.cargo}</td>
                <td className="py-2.5 px-4 text-nord-gray">{e.empresa.name}</td>
                <td className="py-2.5 px-4 text-nord-gray">{format(new Date(e.admissionDate), "dd/MM/yyyy")}</td>
                <td className="py-2.5 px-4 text-nord-gray">{tempoDeEmpresa(e.admissionDate)}</td>
                <td className="py-2.5 px-4">
                  <Badge tone={STATUS_TONE[e.status] ?? "default"}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                </td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-3 justify-end">
                    <Link href={`/portal/rh/colaboradores/${e.id}`} className="flex items-center gap-1 text-nord-gray hover:text-white text-xs">
                      <Eye size={14} /> Visualizar
                    </Link>
                    {canCreate && (
                      <>
                        <button onClick={() => openEdit(e)} className="text-nord-gray hover:text-white">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirmDeleteId(e.id)} className="text-nord-gray hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-nord-gray text-sm">
                  Nenhum colaborador encontrado com os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar colaborador" : "Novo colaborador"} widthClass="max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Cargo">
            <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="input" />
          </Field>
          <Field label="Setor">
            <input value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} className="input" />
          </Field>
          <Field label="Data de admissão">
            <input type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} className="input" />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              <option value="ATIVO">Ativo</option>
              <option value="FERIAS">Férias</option>
              <option value="AFASTADO">Afastado</option>
              <option value="DESLIGADO">Desligado</option>
            </select>
          </Field>
          <Field label="Telefone">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </Field>
          <Field label="E-mail">
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </Field>
          <Field label="CPF">
            <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="input" />
          </Field>
          <Field label="Chave Pix">
            <input value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} className="input" />
          </Field>
          <Field label="Data de nascimento">
            <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className="input" />
          </Field>
          <Field label="Escala">
            <input value={form.escala} onChange={(e) => setForm({ ...form, escala: e.target.value })} className="input" placeholder="6x1, 5x2..." />
          </Field>
          <Field label="Salário fixo">
            <input type="number" value={form.salarioFixo} onChange={(e) => setForm({ ...form, salarioFixo: e.target.value })} className="input" />
          </Field>
          <Field label="Gestor responsável">
            <input value={form.gestorResponsavel} onChange={(e) => setForm({ ...form, gestorResponsavel: e.target.value })} className="input" />
          </Field>
          <Field label="Supervisor">
            <input value={form.supervisorResponsavel} onChange={(e) => setForm({ ...form, supervisorResponsavel: e.target.value })} className="input" />
          </Field>
          <Field label="Última avaliação (data)">
            <input type="date" value={form.lastEvaluationDate} onChange={(e) => setForm({ ...form, lastEvaluationDate: e.target.value })} className="input" />
          </Field>
          <Field label="Última avaliação (nota/obs)">
            <input value={form.lastEvaluationNote} onChange={(e) => setForm({ ...form, lastEvaluationNote: e.target.value })} className="input" />
          </Field>
          <Field label="Último treinamento (data)">
            <input type="date" value={form.lastTrainingDate} onChange={(e) => setForm({ ...form, lastTrainingDate: e.target.value })} className="input" />
          </Field>
          <Field label="Último treinamento (nome)">
            <input value={form.lastTrainingName} onChange={(e) => setForm({ ...form, lastTrainingName: e.target.value })} className="input" />
          </Field>
        </div>
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir colaborador"
        message="Tem certeza que deseja excluir este colaborador?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

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
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-nord-gray mb-1">{label}</span>
      {children}
    </label>
  );
}
