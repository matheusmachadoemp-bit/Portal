"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { StatCard, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { tempoDeEmpresa } from "@/lib/rh-helpers";
import { format } from "date-fns";
import { FinanceiroClient } from "../../financeiro/financeiro-client";
import { PontoEletronicoClient } from "../../ponto-eletronico/ponto-eletronico-client";
import { OcorrenciasClient } from "../../ocorrencias/ocorrencias-client";
import { FeriasClient } from "../../ferias/ferias-client";
import { UniformesClient } from "../../uniformes/uniformes-client";
import { DocumentosClient } from "../../documentos/documentos-client";

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

const TABS = ["Resumo", "Financeiro", "Ponto Eletrônico", "Ocorrências", "Férias", "Uniformes", "Documentos"] as const;

export function EmployeeProfileClient({
  employee,
  financeEntries,
  timeEntries,
  occurrences,
  vacations,
  uniformDeliveries,
  documents,
  canCreate = true,
}: {
  employee: EmployeeDTO;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  financeEntries: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timeEntries: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  occurrences: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vacations: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uniformDeliveries: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  documents: any[];
  canCreate?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resumo");
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState({
    name: employee.name,
    cargo: employee.cargo,
    setor: employee.setor,
    admissionDate: format(new Date(employee.admissionDate), "yyyy-MM-dd"),
    status: employee.status,
    phone: employee.phone ?? "",
    email: employee.email ?? "",
    cpf: employee.cpf ?? "",
    birthDate: employee.birthDate ? format(new Date(employee.birthDate), "yyyy-MM-dd") : "",
    escala: employee.escala ?? "",
    gestorResponsavel: employee.gestorResponsavel ?? "",
    supervisorResponsavel: employee.supervisorResponsavel ?? "",
    salarioFixo: employee.salarioFixo !== null ? String(employee.salarioFixo) : "",
    lastEvaluationDate: employee.lastEvaluationDate ? format(new Date(employee.lastEvaluationDate), "yyyy-MM-dd") : "",
    lastEvaluationNote: employee.lastEvaluationNote ?? "",
    lastTrainingDate: employee.lastTrainingDate ? format(new Date(employee.lastTrainingDate), "yyyy-MM-dd") : "",
    lastTrainingName: employee.lastTrainingName ?? "",
  });

  const totals = useMemo(() => {
    const sumType = (type: string) => financeEntries.filter((f) => f.type === type).reduce((s, f) => s + f.value, 0);
    const salario = sumType("SALARIO");
    const comissao = sumType("COMISSAO");
    const bonificacao = sumType("BONIFICACAO");
    const desconto = sumType("DESCONTO");
    const vt = sumType("VALE_TRANSPORTE");
    const va = sumType("VALE_ALIMENTACAO");
    const outro = sumType("OUTRO");
    return { totalRecebido: salario + comissao + bonificacao + vt + va + outro - desconto, comissao, bonificacao };
  }, [financeEntries]);

  const resumo = useMemo(() => {
    const faltas = occurrences.filter((o) => o.type === "FALTA").length;
    const atrasos = occurrences.filter((o) => o.type === "ATRASO").length;
    const advertencias = occurrences.filter((o) => o.type === "ADVERTENCIA").length;
    const suspensoes = occurrences.filter((o) => o.type === "SUSPENSAO").length;
    const diasDisponiveis = vacations
      .filter((v) => v.status !== "CANCELADA")
      .reduce((s, v) => s + (v.diasDireito - (v.dias ?? 0)), 0);
    const feriasVencidas = vacations.filter(
      (v) => v.status !== "CONCLUIDA" && v.status !== "CANCELADA" && new Date(v.periodoAquisitivoFim) < new Date()
    ).length;
    return { faltas, atrasos, advertencias, suspensoes, diasDisponiveis, feriasVencidas };
  }, [occurrences, vacations]);

  async function submitEdit() {
    await fetch(`/api/rh/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowEdit(false);
    router.refresh();
  }

  const initials = employee.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div className="nord-card p-5 flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {employee.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={employee.photoUrl} alt={employee.name} className="w-16 h-16 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-nord-blue/20 text-nord-blue text-xl font-semibold flex items-center justify-center shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-white text-lg font-semibold">{employee.name}</h2>
              <Badge tone={STATUS_TONE[employee.status] ?? "default"}>{STATUS_LABEL[employee.status] ?? employee.status}</Badge>
            </div>
            <p className="text-sm text-nord-gray">
              {employee.cargo} · {employee.setor} · {employee.empresa.name}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-nord-gray">
              <span>Admissão: {format(new Date(employee.admissionDate), "dd/MM/yyyy")}</span>
              <span>Tempo de empresa: {tempoDeEmpresa(employee.admissionDate)}</span>
              {employee.cpf && <span>CPF: {employee.cpf}</span>}
              {employee.phone && <span>Tel: {employee.phone}</span>}
            </div>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white self-start"
          >
            <Pencil size={13} /> Editar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Recebido" value={formatCurrency(totals.totalRecebido)} icon="Wallet" color="#22c55e" />
        <StatCard label="Salário Fixo" value={employee.salarioFixo ? formatCurrency(employee.salarioFixo) : "-"} icon="DollarSign" />
        <StatCard label="Comissões" value={formatCurrency(totals.comissao)} icon="TrendingUp" />
        <StatCard label="Bonificações" value={formatCurrency(totals.bonificacao)} icon="Gift" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              tab === t ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Resumo" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Faltas" value={formatNumber(resumo.faltas)} icon="UserX" color="#ef4444" />
            <StatCard label="Atrasos" value={formatNumber(resumo.atrasos)} icon="Clock" color="#eab308" />
            <StatCard label="Advertências" value={formatNumber(resumo.advertencias)} icon="AlertTriangle" color="#f97316" />
            <StatCard label="Suspensões" value={formatNumber(resumo.suspensoes)} icon="Ban" color="#ef4444" />
            <StatCard label="Dias de férias disponíveis" value={formatNumber(resumo.diasDisponiveis)} icon="Palmtree" color="#22c55e" />
            <StatCard label="Férias a vencer" value={formatNumber(resumo.feriasVencidas)} icon="AlertCircle" color="#ef4444" />
          </div>
          <div className="nord-card p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <InfoRow label="Escala" value={employee.escala} />
            <InfoRow label="Supervisor" value={employee.supervisorResponsavel} />
            <InfoRow label="Gestor" value={employee.gestorResponsavel} />
            <InfoRow
              label="Última avaliação"
              value={
                employee.lastEvaluationDate
                  ? `${format(new Date(employee.lastEvaluationDate), "dd/MM/yyyy")}${employee.lastEvaluationNote ? " — " + employee.lastEvaluationNote : ""}`
                  : null
              }
            />
            <InfoRow
              label="Último treinamento"
              value={
                employee.lastTrainingDate
                  ? `${employee.lastTrainingName ?? "Treinamento"} (${format(new Date(employee.lastTrainingDate), "dd/MM/yyyy")})`
                  : null
              }
            />
          </div>
        </div>
      )}

      {tab === "Financeiro" && (
        <FinanceiroClient initialEntries={financeEntries} employees={[]} fixedEmployeeId={employee.id} canCreate={canCreate} />
      )}
      {tab === "Ponto Eletrônico" && (
        <PontoEletronicoClient initialEntries={timeEntries} employees={[]} fixedEmployeeId={employee.id} canCreate={canCreate} />
      )}
      {tab === "Ocorrências" && (
        <OcorrenciasClient initialOccurrences={occurrences} employees={[]} fixedEmployeeId={employee.id} canCreate={canCreate} />
      )}
      {tab === "Férias" && (
        <FeriasClient initialVacations={vacations} employees={[]} fixedEmployeeId={employee.id} canCreate={canCreate} />
      )}
      {tab === "Uniformes" && (
        <UniformesClient initialDeliveries={uniformDeliveries} employees={[]} fixedEmployeeId={employee.id} canCreate={canCreate} />
      )}
      {tab === "Documentos" && (
        <DocumentosClient initialDocuments={documents} employees={[]} fixedEmployeeId={employee.id} canCreate={canCreate} />
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Editar colaborador" widthClass="max-w-2xl">
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
          <Field label="Data de nascimento">
            <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className="input" />
          </Field>
          <Field label="Escala">
            <input value={form.escala} onChange={(e) => setForm({ ...form, escala: e.target.value })} className="input" />
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
        <button onClick={submitEdit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
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

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between border-b border-nord-border/50 pb-2">
      <span className="text-nord-gray text-xs">{label}</span>
      <span className="text-white">{value || "-"}</span>
    </div>
  );
}
