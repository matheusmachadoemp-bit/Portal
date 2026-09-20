"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, FormError } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { tempoDeEmpresa } from "@/lib/rh-helpers";
import { sanitizeFileName } from "@/lib/upload";
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
  isGrupoNordMode = true,
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
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resumo");
  const [showEdit, setShowEdit] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Troca de foto direto no cabeçalho da ficha — mesmo mecanismo
  // (@vercel/blob/client + PATCH só da URL) do avatar do próprio usuário em
  // src/components/topbar/user-menu.tsx (handleAvatarChange). "photoUrl"
  // local sobrepõe employee.photoUrl assim que o upload termina; router.refresh()
  // (chamado ao fechar o modal de edição) recarrega os dados do servidor e
  // volta a alinhar tudo, então não há necessidade de um segundo estado aqui.
  const [photoUrl, setPhotoUrl] = useState(employee.photoUrl);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: employee.name,
    cargo: employee.cargo,
    setor: employee.setor,
    admissionDate: format(new Date(employee.admissionDate), "yyyy-MM-dd"),
    status: employee.status,
    phone: employee.phone ?? "",
    email: employee.email ?? "",
    cpf: employee.cpf ?? "",
    pixKey: employee.pixKey ?? "",
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

  // Catálogo de Cargos/Setores já cadastrados (EmployeeCargo/EmployeeSetor, mesma loja do
  // colaborador) — alimenta os selects "Cargo"/"Setor" do modal de edição, em vez de texto livre.
  // Mesmo padrão de RH > Colaboradores (colaboradores-client.tsx): GET /api/rh/cargos e
  // /api/rh/setores, com um modo "digitar novo" que entra sozinho quando o catálogo está vazio,
  // ou manualmente ao escolher "+ Cadastrar novo...".
  const [cargoOptions, setCargoOptions] = useState<string[]>([]);
  const [setorOptions, setSetorOptions] = useState<string[]>([]);
  const [cargoCatalogError, setCargoCatalogError] = useState<string | null>(null);
  const [setorCatalogError, setSetorCatalogError] = useState<string | null>(null);
  const [cargoManualEntry, setCargoManualEntry] = useState(false);
  const [setorManualEntry, setSetorManualEntry] = useState(false);

  useEffect(() => {
    fetch("/api/rh/cargos")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Não foi possível carregar a lista de cargos.");
        }
        return res.json();
      })
      .then((data) => setCargoOptions((data.cargos ?? []).map((c: { nome: string }) => c.nome)))
      .catch((err) =>
        setCargoCatalogError(err instanceof Error ? err.message : "Não foi possível carregar a lista de cargos.")
      );

    fetch("/api/rh/setores")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Não foi possível carregar a lista de setores.");
        }
        return res.json();
      })
      .then((data) => setSetorOptions((data.setores ?? []).map((s: { nome: string }) => s.nome)))
      .catch((err) =>
        setSetorCatalogError(err instanceof Error ? err.message : "Não foi possível carregar a lista de setores.")
      );
  }, []);

  const showCargoInput = cargoManualEntry || cargoOptions.length === 0;
  const showSetorInput = setorManualEntry || setorOptions.length === 0;
  const cargoSelectOptions = useMemo(
    () => (form.cargo && !cargoOptions.includes(form.cargo) ? [form.cargo, ...cargoOptions] : cargoOptions),
    [form.cargo, cargoOptions]
  );
  const setorSelectOptions = useMemo(
    () => (form.setor && !setorOptions.includes(form.setor) ? [form.setor, ...setorOptions] : setorOptions),
    [form.setor, setorOptions]
  );

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

  async function handlePhotoChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
      const res = await fetch(`/api/rh/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: blob.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhotoError(data?.error ?? "Não foi possível salvar a foto.");
        return;
      }
      setPhotoUrl(blob.url);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Falha ao enviar a foto.");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function submitEdit() {
    if (editSubmitting) return;
    setEditError(null);
    if (!form.cargo.trim()) return setEditError("Informe o cargo.");
    if (!form.setor.trim()) return setEditError("Informe o setor.");
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/rh/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao salvar colaborador.");
      }
      setShowEdit(false);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erro ao salvar colaborador.");
    } finally {
      setEditSubmitting(false);
    }
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
          <div className="relative shrink-0">
            {photoUrl ? (
              <Image src={photoUrl} alt={employee.name} width={64} height={64} className="w-16 h-16 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-nord-blue/20 text-nord-blue text-xl font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            {canCreate && (
              <>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  title="Alterar foto"
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-nord-blue hover:bg-nord-blue-light border-2 border-nord-card flex items-center justify-center text-white disabled:opacity-60"
                >
                  <Pencil size={11} />
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handlePhotoChange(e.target.files)}
                />
              </>
            )}
          </div>
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
              {employee.pixKey && <span>Pix: {employee.pixKey}</span>}
            </div>
            {photoUploading && <p className="text-xs text-nord-gray mt-1">Enviando foto...</p>}
            {!photoUploading && photoError && <p className="text-xs text-nord-danger mt-1">{photoError}</p>}
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setEditError(null);
              setCargoManualEntry(false);
              setSetorManualEntry(false);
              setShowEdit(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white self-start"
          >
            <Pencil size={13} /> Editar
          </button>
        )}
      </div>

      <SortableStatCards
        storageKey="rh-colaborador-perfil-kpi-order"
        cards={[
          { key: "total-recebido", label: "Total Recebido", value: formatCurrency(totals.totalRecebido), icon: "Wallet", color: "#22c55e" },
          { key: "salario-fixo", label: "Salário Fixo", value: employee.salarioFixo ? formatCurrency(employee.salarioFixo) : "-", icon: "DollarSign" },
          { key: "comissoes", label: "Comissões", value: formatCurrency(totals.comissao), icon: "TrendingUp" },
          { key: "bonificacoes", label: "Bonificações", value: formatCurrency(totals.bonificacao), icon: "Gift" },
        ]}
      />

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
          <SortableStatCards
            storageKey="rh-colaborador-resumo-kpi-order"
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
            cards={[
              { key: "faltas", label: "Faltas", value: formatNumber(resumo.faltas), icon: "UserX", color: "#ef4444" },
              { key: "atrasos", label: "Atrasos", value: formatNumber(resumo.atrasos), icon: "Clock", color: "#eab308" },
              { key: "advertencias", label: "Advertências", value: formatNumber(resumo.advertencias), icon: "AlertTriangle", color: "#f97316" },
              { key: "suspensoes", label: "Suspensões", value: formatNumber(resumo.suspensoes), icon: "Ban", color: "#ef4444" },
              { key: "dias-ferias-disponiveis", label: "Dias de férias disponíveis", value: formatNumber(resumo.diasDisponiveis), icon: "Palmtree", color: "#22c55e" },
              { key: "ferias-a-vencer", label: "Férias a vencer", value: formatNumber(resumo.feriasVencidas), icon: "AlertCircle", color: "#ef4444" },
            ]}
          />
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
        <FinanceiroClient
          initialEntries={financeEntries}
          employees={[]}
          fixedEmployeeId={employee.id}
          canCreate={canCreate}
          isGrupoNordMode={isGrupoNordMode}
        />
      )}
      {tab === "Ponto Eletrônico" && (
        <PontoEletronicoClient
          initialEntries={timeEntries}
          employees={[]}
          fixedEmployeeId={employee.id}
          canCreate={canCreate}
          isGrupoNordMode={isGrupoNordMode}
        />
      )}
      {tab === "Ocorrências" && (
        <OcorrenciasClient
          initialOccurrences={occurrences}
          employees={[]}
          fixedEmployeeId={employee.id}
          canCreate={canCreate}
          isGrupoNordMode={isGrupoNordMode}
        />
      )}
      {tab === "Férias" && (
        <FeriasClient
          initialVacations={vacations}
          employees={[]}
          fixedEmployeeId={employee.id}
          canCreate={canCreate}
          isGrupoNordMode={isGrupoNordMode}
        />
      )}
      {tab === "Uniformes" && (
        <UniformesClient
          initialDeliveries={uniformDeliveries}
          employees={[]}
          fixedEmployeeId={employee.id}
          canCreate={canCreate}
          isGrupoNordMode={isGrupoNordMode}
        />
      )}
      {tab === "Documentos" && (
        <DocumentosClient
          initialDocuments={documents}
          employees={[]}
          fixedEmployeeId={employee.id}
          canCreate={canCreate}
          isGrupoNordMode={isGrupoNordMode}
        />
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Editar colaborador" widthClass="max-w-2xl">
        <FormError message={editError} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitEdit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nome">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
              </Field>
            </div>
            <Field label="Cargo">
              {showCargoInput ? (
                <>
                  <input
                    required
                    value={form.cargo}
                    onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                    className="input"
                    placeholder="Digite o cargo"
                  />
                  {cargoCatalogError ? (
                    <p className="text-[11px] text-nord-warning mt-1">
                      {cargoCatalogError} Digite normalmente — será cadastrado ao salvar.
                    </p>
                  ) : cargoOptions.length === 0 ? (
                    <p className="text-[11px] text-nord-gray mt-1">
                      Nenhum cargo cadastrado ainda nesta loja. Digite para cadastrar o primeiro.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCargoManualEntry(false)}
                      className="text-[11px] text-nord-blue-light hover:underline mt-1"
                    >
                      Usar lista de cargos já cadastrados
                    </button>
                  )}
                </>
              ) : (
                <select
                  required
                  value={form.cargo}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setCargoManualEntry(true);
                      setForm({ ...form, cargo: "" });
                    } else {
                      setForm({ ...form, cargo: e.target.value });
                    }
                  }}
                  className="input"
                >
                  <option value="" disabled>
                    Selecione o cargo
                  </option>
                  {cargoSelectOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__new__">+ Cadastrar novo cargo...</option>
                </select>
              )}
            </Field>
            <Field label="Setor">
              {showSetorInput ? (
                <>
                  <input
                    required
                    value={form.setor}
                    onChange={(e) => setForm({ ...form, setor: e.target.value })}
                    className="input"
                    placeholder="Digite o setor"
                  />
                  {setorCatalogError ? (
                    <p className="text-[11px] text-nord-warning mt-1">
                      {setorCatalogError} Digite normalmente — será cadastrado ao salvar.
                    </p>
                  ) : setorOptions.length === 0 ? (
                    <p className="text-[11px] text-nord-gray mt-1">
                      Nenhum setor cadastrado ainda nesta loja. Digite para cadastrar o primeiro.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSetorManualEntry(false)}
                      className="text-[11px] text-nord-blue-light hover:underline mt-1"
                    >
                      Usar lista de setores já cadastrados
                    </button>
                  )}
                </>
              ) : (
                <select
                  required
                  value={form.setor}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setSetorManualEntry(true);
                      setForm({ ...form, setor: "" });
                    } else {
                      setForm({ ...form, setor: e.target.value });
                    }
                  }}
                  className="input"
                >
                  <option value="" disabled>
                    Selecione o setor
                  </option>
                  {setorSelectOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="__new__">+ Cadastrar novo setor...</option>
                </select>
              )}
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
          <button
            type="submit"
            disabled={editSubmitting}
            className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {editSubmitting ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </Modal>

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
