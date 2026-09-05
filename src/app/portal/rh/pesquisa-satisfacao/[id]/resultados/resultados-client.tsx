"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, MessageSquare, Sheet, FileDown } from "lucide-react";
import { Badge, ProgressBar, Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { SATISFACTION_THEME_LABEL } from "@/lib/satisfaction";
import { exportRowsToCsv, exportRowsToExcel } from "@/lib/export-utils";
import { exportKpiReportToPdf } from "@/lib/pdf-export";
import type { SatisfactionTheme } from "@prisma/client";

type Results = {
  totalInvitations: number;
  totalResponses: number;
  participacaoPercent: number | null;
  enpsGeral: { enps: number; promotores: number; neutros: number; detratores: number; total: number };
  satisfacaoGeralPercent: number | null;
  porSetor: { setor: string; totalRespostas: number; protegido: boolean; enps: number | null; satisfacaoPercent: number | null }[];
  porTema: { tema: SatisfactionTheme; satisfacaoPercent: number; total: number }[];
  comentarios: { id: string; setor: string; tema: SatisfactionTheme | null; texto: string }[];
  setoresOcultados: string[];
  alerts: { setor: string; enps: number | null; satisfacaoPercent: number | null; mensagem: string }[];
};

function enpsColor(enps: number) {
  if (enps >= 50) return "#22c55e";
  if (enps >= 0) return "#f59e0b";
  return "#ef4444";
}

export function ResultadosClient({ surveyId, surveyTitle }: { surveyId: string; surveyTitle: string }) {
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterSetor, setFilterSetor] = useState("");
  const [filterTema, setFilterTema] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/satisfaction/surveys/${surveyId}/results`)
      .then((res) => res.json())
      .then((json) => {
        if (active) setData(json);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [surveyId]);

  const comentariosFiltrados = useMemo(() => {
    if (!data) return [];
    return data.comentarios.filter((c) => {
      if (filterSetor && c.setor !== filterSetor) return false;
      if (filterTema && c.tema !== filterTema) return false;
      return true;
    });
  }, [data, filterSetor, filterTema]);

  if (loading) return <div className="nord-card p-6 text-center text-sm text-nord-gray">Carregando resultados...</div>;
  if (!data) return <div className="nord-card p-6 text-center text-sm text-nord-gray">Não foi possível carregar os resultados.</div>;

  if (data.totalResponses === 0) {
    return (
      <div className="nord-card p-6 text-center text-sm text-nord-gray">
        Ainda não há respostas para essa pesquisa. Os indicadores (eNPS, satisfação, participação e comentários) aparecerão
        aqui assim que as respostas começarem a chegar.
      </div>
    );
  }

  const setoresDisponiveis = Array.from(new Set(data.porSetor.map((s) => s.setor)));
  const temasDisponiveis = Array.from(new Set(data.comentarios.map((c) => c.tema).filter((t): t is SatisfactionTheme => !!t)));

  const setorRows = data.porSetor.map((s) => ({
    Setor: s.setor,
    Respostas: s.totalRespostas,
    eNPS: s.protegido ? "Protegido (k-anonimato)" : String(s.enps),
    "Satisfação (%)": s.protegido ? "Protegido (k-anonimato)" : s.satisfacaoPercent != null ? s.satisfacaoPercent : "—",
  }));
  const fileBase = surveyTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  function exportPdf() {
    exportKpiReportToPdf(surveyTitle, "Resultados da pesquisa de satisfação", [
      {
        title: "Resumo",
        rows: [
          ["eNPS da pesquisa", String(data!.enpsGeral.enps)],
          ["Satisfação geral", data!.satisfacaoGeralPercent != null ? `${data!.satisfacaoGeralPercent}%` : "—"],
          ["Participação", data!.participacaoPercent != null ? `${data!.participacaoPercent}%` : "—"],
          ["Alertas críticos", String(data!.alerts.length)],
        ],
      },
      {
        title: "Comparação por setor",
        rows: setorRows.map((r) => [r.Setor, `${r.Respostas} resposta(s) — eNPS ${r.eNPS} — Satisfação ${r["Satisfação (%)"]}`]),
      },
      {
        title: "Satisfação por tema",
        rows: data!.porTema.map((t) => [SATISFACTION_THEME_LABEL[t.tema], `${t.satisfacaoPercent}%`]),
      },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={exportPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-panel border border-nord-border text-white hover:border-white/30"
        >
          <FileText size={13} /> PDF executivo
        </button>
        <button
          onClick={() => exportRowsToExcel(fileBase, "Comparação por setor", setorRows)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-panel border border-nord-border text-white hover:border-white/30"
        >
          <Sheet size={13} /> Excel
        </button>
        <button
          onClick={() => exportRowsToCsv(fileBase, setorRows)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-panel border border-nord-border text-white hover:border-white/30"
        >
          <FileDown size={13} /> CSV agregado
        </button>
      </div>

      <SortableStatCards
        storageKey="satisfaction-results-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "enps", label: "eNPS da pesquisa", value: String(data.enpsGeral.enps), icon: "Smile", color: enpsColor(data.enpsGeral.enps) },
          {
            key: "satisfacao",
            label: "Satisfação geral",
            value: data.satisfacaoGeralPercent != null ? `${data.satisfacaoGeralPercent}%` : "—",
            icon: "Heart",
            color: "#3B82F6",
          },
          {
            key: "participacao",
            label: "Participação",
            value: data.participacaoPercent != null ? `${data.participacaoPercent}%` : "—",
            icon: "Users",
            color: "#22c55e",
            hint: `${data.totalResponses} de ${data.totalInvitations} convite(s)`,
          },
          {
            key: "alertas",
            label: "Alertas críticos",
            value: String(data.alerts.length),
            icon: "AlertTriangle",
            color: data.alerts.length > 0 ? "#ef4444" : "#9AA4B2",
          },
        ]}
      />

      {data.alerts.length > 0 && (
        <Section title="Alertas críticos">
          <div className="space-y-2">
            {data.alerts.map((a) => (
              <div key={a.setor} className="flex items-start gap-2 p-3 rounded-lg bg-red-950/30 border border-red-900/60">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">{a.mensagem}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Comparação por setor">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white border-b border-nord-border">
                <th className="py-2 px-3">Setor</th>
                <th className="py-2 px-3">Respostas</th>
                <th className="py-2 px-3">eNPS</th>
                <th className="py-2 px-3">Satisfação</th>
              </tr>
            </thead>
            <tbody>
              {data.porSetor.map((s) => (
                <tr key={s.setor} className="border-b border-nord-border/50">
                  <td className="py-2 px-3 text-white">{s.setor}</td>
                  <td className="py-2 px-3 text-nord-gray">{s.totalRespostas}</td>
                  {s.protegido ? (
                    <td colSpan={2} className="py-2 px-3 text-nord-gray text-xs">
                      Resultado ocultado para proteger o anonimato dos colaboradores.
                    </td>
                  ) : (
                    <>
                      <td className="py-2 px-3">
                        <Badge tone={s.enps != null && s.enps >= 0 ? "success" : "danger"}>{s.enps}</Badge>
                      </td>
                      <td className="py-2 px-3 text-white">{s.satisfacaoPercent != null ? `${s.satisfacaoPercent}%` : "—"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {data.porTema.length > 0 && (
        <Section title="Satisfação por tema">
          <div className="space-y-3">
            {data.porTema.map((t) => (
              <div key={t.tema}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-white">{SATISFACTION_THEME_LABEL[t.tema]}</span>
                  <span className="text-nord-gray">{t.satisfacaoPercent}%</span>
                </div>
                <ProgressBar percent={t.satisfacaoPercent} color={t.satisfacaoPercent >= 50 ? "#22c55e" : "#ef4444"} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Comentários anônimos"
        action={
          <div className="flex items-center gap-2">
            <select value={filterSetor} onChange={(e) => setFilterSetor(e.target.value)} className="input w-auto text-xs">
              <option value="">Todos os setores</option>
              {setoresDisponiveis.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={filterTema} onChange={(e) => setFilterTema(e.target.value)} className="input w-auto text-xs">
              <option value="">Todos os temas</option>
              {temasDisponiveis.map((t) => (
                <option key={t} value={t}>
                  {SATISFACTION_THEME_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {data.setoresOcultados.length > 0 && (
          <p className="text-[11px] text-nord-gray mb-3">
            Comentários de {data.setoresOcultados.join(", ")} foram ocultados para proteger o anonimato dos colaboradores
            (menos de 5 respostas no grupo).
          </p>
        )}
        {comentariosFiltrados.length === 0 ? (
          <p className="text-sm text-nord-gray text-center py-6">Nenhum comentário disponível com os filtros atuais.</p>
        ) : (
          <div className="space-y-2">
            {comentariosFiltrados.map((c) => (
              <div key={c.id} className="p-3 rounded-lg bg-nord-panel border border-nord-border">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={12} className="text-nord-blue-light" />
                  <span className="text-[11px] text-nord-gray">{c.setor}</span>
                  {c.tema && <Badge tone="info">{SATISFACTION_THEME_LABEL[c.tema]}</Badge>}
                </div>
                <p className="text-sm text-white">{c.texto}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
