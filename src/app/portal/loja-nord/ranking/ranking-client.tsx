"use client";

import { useState } from "react";
import { Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/calc";

type RankingRow = {
  userId: string;
  nome: string;
  avatarUrl: string | null;
  setor: string | null;
  loja: string;
  pontos: number;
  posicao: number;
  tarefas: number;
  checklists: number;
  cursos: number;
  evolucao: number | null;
};

const MEDAL_COLORS = ["#eab308", "#94a3b8", "#b45309"];
const PODIUM_HEIGHT = ["h-24", "h-32", "h-20"];

function Avatar({ nome, avatarUrl, size = 40 }: { nome: string; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- avatar vem do Vercel Blob (domínio variável)
    return <img src={avatarUrl} alt={nome} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-nord-blue/20 text-nord-blue-light flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size / 2.4 }}
    >
      {nome.charAt(0).toUpperCase()}
    </div>
  );
}

export function RankingClient({
  initialRanking,
  empresas,
  setores,
  meuUserId,
}: {
  initialRanking: RankingRow[];
  empresas: { id: string; name: string }[];
  setores: string[];
  meuUserId: string;
}) {
  const [ranking, setRanking] = useState(initialRanking);
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "ano" | "geral">("geral");
  const [empresaId, setEmpresaId] = useState("");
  const [setor, setSetor] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters(next: { periodo?: typeof periodo; empresaId?: string; setor?: string }) {
    const p = next.periodo ?? periodo;
    const e = next.empresaId ?? empresaId;
    const s = next.setor ?? setor;
    setPeriodo(p);
    setEmpresaId(e);
    setSetor(s);
    setLoading(true);
    try {
      const params = new URLSearchParams({ periodo: p });
      if (e) params.set("empresaId", e);
      if (s) params.set("setor", s);
      const res = await fetch(`/api/loja-nord/ranking?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRanking(data.ranking);
      }
    } finally {
      setLoading(false);
    }
  }

  const top3 = ranking.slice(0, 3);
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <div className="space-y-6">
      <div className="nord-card p-3 flex flex-wrap items-center gap-3">
        <select value={periodo} onChange={(e) => applyFilters({ periodo: e.target.value as typeof periodo })} className="input !w-auto">
          <option value="semana">Ranking semanal</option>
          <option value="mes">Ranking mensal</option>
          <option value="ano">Ranking anual</option>
          <option value="geral">Ranking geral</option>
        </select>
        <select value={empresaId} onChange={(e) => applyFilters({ empresaId: e.target.value })} className="input !w-auto">
          <option value="">Todas as lojas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        {setores.length > 0 && (
          <select value={setor} onChange={(e) => applyFilters({ setor: e.target.value })} className="input !w-auto">
            <option value="">Todos os setores</option>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {loading && <span className="text-xs text-nord-gray">Carregando...</span>}
      </div>

      {ranking.length === 0 ? (
        <div className="nord-card p-8 text-center">
          <Trophy size={28} className="text-nord-gray mx-auto mb-3" />
          <p className="text-white text-sm font-medium">Ninguém pontuou nesse período ainda</p>
        </div>
      ) : (
        <>
          {top3.length > 0 && (
            <Section title="Pódio">
              <div className="flex items-end justify-center gap-4 pt-4">
                {podiumOrder.map((r) => {
                  const originalIdx = top3.findIndex((t) => t.userId === r.userId);
                  return (
                    <div key={r.userId} className="flex flex-col items-center">
                      <Avatar nome={r.nome} avatarUrl={r.avatarUrl} size={56} />
                      <p className="text-white text-xs font-medium text-center max-w-[110px] truncate mt-2">{r.nome}</p>
                      <p className="text-[11px] text-nord-gray">
                        {r.setor ?? "-"} · {r.loja}
                      </p>
                      <p className="text-[11px] text-nord-gray mb-2">{formatNumber(r.pontos)} pts</p>
                      <div
                        className={`w-24 ${PODIUM_HEIGHT[originalIdx]} rounded-t-lg flex items-start justify-center pt-1.5`}
                        style={{ backgroundColor: `${MEDAL_COLORS[originalIdx]}33` }}
                      >
                        <span className="text-sm font-bold" style={{ color: MEDAL_COLORS[originalIdx] }}>
                          {originalIdx + 1}º
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Classificação completa">
            <div className="overflow-x-auto nord-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Colaborador</th>
                    <th className="py-2 pr-4">Setor</th>
                    <th className="py-2 pr-4">Loja</th>
                    <th className="py-2 pr-4">Pontos</th>
                    <th className="py-2 pr-4">Tarefas</th>
                    <th className="py-2 pr-4">Checklists</th>
                    <th className="py-2 pr-4">Cursos</th>
                    <th className="py-2 pr-4">Evolução</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr
                      key={r.userId}
                      className={`border-b border-nord-border/50 hover:bg-white/5 ${
                        r.userId === meuUserId ? "bg-nord-blue/10" : ""
                      }`}
                    >
                      <td className="py-2 pr-4 text-nord-gray">
                        {r.posicao <= 3 ? (
                          <Trophy size={14} style={{ color: MEDAL_COLORS[r.posicao - 1] }} />
                        ) : (
                          r.posicao
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Avatar nome={r.nome} avatarUrl={r.avatarUrl} size={26} />
                          <span className="text-white">{r.nome}</span>
                          {r.userId === meuUserId && <Badge tone="info">Você</Badge>}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-nord-gray">{r.setor ?? "-"}</td>
                      <td className="py-2 pr-4 text-nord-gray">{r.loja}</td>
                      <td className="py-2 pr-4 text-white font-medium">{formatNumber(r.pontos)}</td>
                      <td className="py-2 pr-4 text-nord-gray">{r.tarefas}</td>
                      <td className="py-2 pr-4 text-nord-gray">{r.checklists}</td>
                      <td className="py-2 pr-4 text-nord-gray">{r.cursos}</td>
                      <td className="py-2 pr-4">
                        {r.evolucao === null || r.evolucao === undefined ? (
                          <Minus size={14} className="text-nord-gray" />
                        ) : r.evolucao > 0 ? (
                          <span className="inline-flex items-center gap-1 text-nord-success text-xs">
                            <ArrowUp size={12} /> {r.evolucao}
                          </span>
                        ) : r.evolucao < 0 ? (
                          <span className="inline-flex items-center gap-1 text-nord-danger text-xs">
                            <ArrowDown size={12} /> {Math.abs(r.evolucao)}
                          </span>
                        ) : (
                          <Minus size={14} className="text-nord-gray" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

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
