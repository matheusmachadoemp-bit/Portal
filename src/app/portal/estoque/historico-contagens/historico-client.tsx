"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Boxes, User, Package, AlertTriangle, DollarSign, CircleCheck } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { COUNT_ITEM_STATUS_LABEL, COUNT_ITEM_STATUS_TONE, COUNT_STATUS_LABEL, COUNT_STATUS_TONE } from "@/lib/estoque";

type CountItem = { nome: string; unidade: string; esperado: number; contado: number | null; diferencaPercent: number | null; status: string; observacao: string | null; justificativa: string | null };
type CountRow = {
  id: string;
  empresaNome: string;
  empresaCor: string;
  type: string;
  setor: string | null;
  mes: number | null;
  semana: number | null;
  ano: number;
  dataContagem: string;
  responsavel: string | null;
  status: string;
  totalItens: number;
  divergencias: number;
  valorDiferenca: number;
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  createdByName: string;
  items: CountItem[];
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function HistoricoContagensClient({ counts }: { counts: CountRow[] }) {
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<CountRow | null>(null);

  const filtered = useMemo(
    () =>
      counts.filter((c) => {
        if (typeFilter && c.type !== typeFilter) return false;
        if (statusFilter && c.status !== statusFilter) return false;
        return true;
      }),
    [counts, typeFilter, statusFilter]
  );

  return (
    <Section
      title="Histórico de contagens"
      action={
        <Toolbar
          filters={
            <>
              <select className="input w-40" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Todos os tipos</option>
                <option value="SEMANAL">Semanal</option>
                <option value="MENSAL">Mensal</option>
              </select>
              <select className="input w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Todos os status</option>
                {Object.entries(COUNT_STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </>
          }
          exportFilename="historico-contagens"
          exportSheetName="Contagens"
          exportRows={() =>
            filtered.map((c) => ({
              Data: format(new Date(c.dataContagem), "dd/MM/yyyy"),
              Tipo: c.type === "MENSAL" ? "Mensal" : "Semanal",
              Setor: c.setor ?? (c.mes ? `${MESES[c.mes - 1]}/${c.ano}` : ""),
              Responsável: c.responsavel ?? "",
              Itens: c.totalItens,
              Divergências: c.divergencias,
              "Valor diferença": c.valorDiferenca,
              Status: COUNT_STATUS_LABEL[c.status] ?? c.status,
            }))
          }
        />
      }
    >
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-white border-b border-nord-border">
              <th className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} className="text-nord-blue-light" /> Data</span>
              </th>
              <th className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5"><ClipboardList size={13} className="text-nord-blue-light" /> Tipo</span>
              </th>
              <th className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5"><Boxes size={13} className="text-nord-blue-light" /> Setor</span>
              </th>
              <th className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5"><User size={13} className="text-nord-blue-light" /> Responsável</span>
              </th>
              <th className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5"><Package size={13} className="text-nord-blue-light" /> Itens</span>
              </th>
              <th className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5"><AlertTriangle size={13} className="text-nord-blue-light" /> Divergências</span>
              </th>
              <th className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5"><DollarSign size={13} className="text-nord-blue-light" /> Diferença</span>
              </th>
              <th className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5"><CircleCheck size={13} className="text-nord-blue-light" /> Status</span>
              </th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-white">{format(new Date(c.dataContagem), "dd/MM/yyyy")}</td>
                <td className="py-2.5 pr-4 text-white">{c.type === "MENSAL" ? "Mensal" : "Semanal"}</td>
                <td className="py-2.5 pr-4 text-white">{c.setor ?? (c.mes ? `${MESES[c.mes - 1]}/${c.ano}` : `Sem. ${c.semana}/${c.ano}`)}</td>
                <td className="py-2.5 pr-4 text-white">{c.responsavel ?? "—"}</td>
                <td className="py-2.5 pr-4 text-white">{c.totalItens}</td>
                <td className="py-2.5 pr-4"><Badge tone={c.divergencias ? "danger" : "default"}>{c.divergencias}</Badge></td>
                <td className="py-2.5 pr-4">
                  <span className={c.valorDiferenca < 0 ? "text-red-400" : "text-emerald-400"}>{formatCurrency(c.valorDiferenca)}</span>
                </td>
                <td className="py-2.5 pr-4"><Badge tone={COUNT_STATUS_TONE[c.status]}>{COUNT_STATUS_LABEL[c.status] ?? c.status}</Badge></td>
                <td className="py-2.5 pr-4 text-right">
                  <button onClick={() => setDetail(c)} className="text-xs text-nord-blue-light hover:underline">
                    Detalhes
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-nord-gray">
                  Nenhuma contagem encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalhes da contagem" widthClass="max-w-3xl">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-nord-gray">
              <div>Loja: <span className="text-white">{detail.empresaNome}</span></div>
              <div>Responsável: <span className="text-white">{detail.responsavel ?? "—"}</span></div>
              <div>Criado por: <span className="text-white">{detail.createdByName}</span></div>
              <div>Aprovado por: <span className="text-white">{detail.aprovadoPor ?? "—"}</span></div>
            </div>
            <div className="overflow-x-auto nord-scrollbar max-h-[45vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                    <th className="py-2 pr-4">Produto</th>
                    <th className="py-2 pr-4">Esperado</th>
                    <th className="py-2 pr-4">Contado</th>
                    <th className="py-2 pr-4">Diferença</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Justificativa</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, idx) => (
                    <tr key={idx} className="border-b border-nord-border/50">
                      <td className="py-2 pr-4 text-white">{it.nome}</td>
                      <td className="py-2 pr-4 text-nord-gray">{formatNumber(it.esperado, 1)} {it.unidade}</td>
                      <td className="py-2 pr-4 text-nord-gray">{it.contado !== null ? `${formatNumber(it.contado, 1)} ${it.unidade}` : "—"}</td>
                      <td className="py-2 pr-4 text-nord-gray">{it.diferencaPercent !== null ? `${it.diferencaPercent >= 0 ? "+" : ""}${it.diferencaPercent.toFixed(1)}%` : "—"}</td>
                      <td className="py-2 pr-4"><Badge tone={COUNT_ITEM_STATUS_TONE[it.status]}>{COUNT_ITEM_STATUS_LABEL[it.status] ?? it.status}</Badge></td>
                      <td className="py-2 pr-4 text-nord-gray">{it.justificativa ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
