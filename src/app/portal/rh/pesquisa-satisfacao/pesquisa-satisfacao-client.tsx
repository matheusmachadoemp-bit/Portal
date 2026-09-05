"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Pencil, Copy, Ban, Trash2, BarChart3 } from "lucide-react";
import { Badge, Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { ConfirmDialog } from "@/components/ui/modal";
import { SATISFACTION_STATUS_LABEL, SATISFACTION_STATUS_TONE } from "@/lib/satisfaction";

type Survey = {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  publico: { empresaId: string; setor: string | null; empresa: { id: string; name: string } }[];
  perguntas: { id: string }[];
  createdBy: { id: string; name: string };
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function PesquisaSatisfacaoClient({
  initialSurveys,
  empresas,
  canCreate,
}: {
  initialSurveys: Survey[];
  empresas: { id: string; name: string }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [surveys, setSurveys] = useState(initialSurveys);
  const [search, setSearch] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return surveys.filter((s) => {
      if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterEmpresa && !s.publico.some((p) => p.empresaId === filterEmpresa)) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      return true;
    });
  }, [surveys, search, filterEmpresa, filterStatus]);

  const kpis = useMemo(() => {
    const ativas = surveys.filter((s) => s.status === "EM_ANDAMENTO").length;
    const total = surveys.length;
    const lojasAlcancadas = new Set(surveys.flatMap((s) => s.publico.map((p) => p.empresaId))).size;
    return { ativas, total, lojasAlcancadas };
  }, [surveys]);

  async function refresh() {
    const res = await fetch("/api/satisfaction/surveys");
    const data = await res.json();
    setSurveys(data.surveys);
  }

  async function duplicate(s: Survey) {
    const detailRes = await fetch(`/api/satisfaction/surveys/${s.id}`);
    const { survey } = await detailRes.json();
    await fetch("/api/satisfaction/surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${survey.title} (cópia)`,
        description: survey.description,
        startDate: survey.startDate,
        endDate: survey.endDate,
        anonima: survey.anonima,
        permitirApenasUmaResposta: survey.permitirApenasUmaResposta,
        exibirResultadoColaborador: survey.exibirResultadoColaborador,
        permitirComentarioAdicional: survey.permitirComentarioAdicional,
        embaralharPerguntas: survey.embaralharPerguntas,
        publico: survey.publico.map((p: { empresaId: string; setor: string | null }) => ({ empresaId: p.empresaId, setor: p.setor })),
        perguntas: survey.perguntas.map((q: { tipo: string; tema: string | null; titulo: string; orientacao: string | null; obrigatoria: boolean; opcoes: { texto: string }[] }) => ({
          tipo: q.tipo,
          tema: q.tema,
          titulo: q.titulo,
          orientacao: q.orientacao,
          obrigatoria: q.obrigatoria,
          opcoes: q.opcoes.map((o) => ({ texto: o.texto })),
        })),
      }),
    });
    await refresh();
  }

  async function cancelSurvey() {
    if (!confirmCancelId) return;
    await fetch(`/api/satisfaction/surveys/${confirmCancelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELADA" }),
    });
    setConfirmCancelId(null);
    await refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const res = await fetch(`/api/satisfaction/surveys/${confirmDeleteId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "Não foi possível excluir essa pesquisa.");
    }
    setConfirmDeleteId(null);
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterEmpresa} onChange={(e) => setFilterEmpresa(e.target.value)} className="input input-compact">
            <option value="">Todas as lojas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input input-compact">
            <option value="">Todos os status</option>
            {Object.entries(SATISFACTION_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 items-stretch">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pesquisa..."
              className="input pl-8 w-48"
            />
          </div>
          {canCreate && (
            <button
              onClick={() => router.push("/portal/rh/pesquisa-satisfacao/criar")}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              + Nova pesquisa
            </button>
          )}
        </div>
      </div>

      <SortableStatCards
        storageKey="satisfaction-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "ativas", label: "Pesquisas em andamento", value: String(kpis.ativas), icon: "PlayCircle", color: "#1464F4" },
          { key: "total", label: "Total de pesquisas", value: String(kpis.total), icon: "ListChecks", color: "#3B82F6" },
          { key: "lojas", label: "Lojas alcançadas", value: String(kpis.lojasAlcancadas), icon: "Building2", color: "#22c55e" },
          { key: "enps", label: "eNPS da equipe", value: "—", icon: "Smile", color: "#f59e0b" },
        ]}
      />

      <Section title="Pesquisas recentes">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white border-b border-nord-border">
                <th className="py-2 px-3">Pesquisa</th>
                <th className="py-2 px-3">Loja</th>
                <th className="py-2 px-3">Perguntas</th>
                <th className="py-2 px-3">Período</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-nord-border/50">
                  <td className="py-2 px-3 text-white">{s.title}</td>
                  <td className="py-2 px-3 text-nord-gray">{s.publico.map((p) => p.empresa.name).join(", ") || "-"}</td>
                  <td className="py-2 px-3 text-nord-gray font-mono">{s.perguntas.length}</td>
                  <td className="py-2 px-3 text-nord-gray font-mono">
                    {formatDate(s.startDate)} – {formatDate(s.endDate)}
                  </td>
                  <td className="py-2 px-3">
                    <Badge tone={SATISFACTION_STATUS_TONE[s.status as keyof typeof SATISFACTION_STATUS_TONE]}>
                      {SATISFACTION_STATUS_LABEL[s.status as keyof typeof SATISFACTION_STATUS_LABEL]}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => router.push(`/portal/rh/pesquisa-satisfacao/${s.id}/resultados`)}
                        className="text-nord-gray hover:text-white"
                        title="Ver resultados"
                      >
                        <BarChart3 size={13} />
                      </button>
                      {canCreate && (
                        <>
                          <button
                            onClick={() => router.push(`/portal/rh/pesquisa-satisfacao/criar?id=${s.id}`)}
                            className="text-nord-gray hover:text-white"
                            title="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => duplicate(s)} className="text-nord-gray hover:text-white" title="Duplicar">
                            <Copy size={13} />
                          </button>
                          {s.status !== "CANCELADA" && s.status !== "CONCLUIDA" && (
                            <button
                              onClick={() => setConfirmCancelId(s.id)}
                              className="text-nord-gray hover:text-white"
                              title="Encerrar"
                            >
                              <Ban size={13} />
                            </button>
                          )}
                          {s.status === "RASCUNHO" && (
                            <button
                              onClick={() => setConfirmDeleteId(s.id)}
                              className="text-nord-gray hover:text-red-400"
                              title="Excluir"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-nord-gray py-8">
                    {surveys.length === 0 ? "Nenhuma pesquisa cadastrada ainda." : "Nenhuma pesquisa encontrada com esses filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir pesquisa"
        message="Tem certeza que deseja excluir esse rascunho? Essa ação não pode ser desfeita."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

      <ConfirmDialog
        open={!!confirmCancelId}
        title="Encerrar pesquisa"
        message="Encerrar a pesquisa impede novas respostas. O histórico e os resultados já coletados são mantidos."
        onConfirm={cancelSurvey}
        onCancel={() => setConfirmCancelId(null)}
        confirmLabel="Encerrar"
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
        .input-compact {
          width: auto;
        }
      `}</style>
    </div>
  );
}
