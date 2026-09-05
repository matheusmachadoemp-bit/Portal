"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Wrench, ClipboardList, FileText, History, LayoutDashboard } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/calc";
import {
  CHAMADO_STATUS_LABEL,
  EQUIPAMENTO_STATUS_LABEL,
  EQUIPAMENTO_STATUS_TONE,
  MANUTENCAO_FREQUENCIA_LABEL,
  MANUTENCAO_TIPO_LABEL,
} from "@/lib/manutencao";
import { EquipamentoFormModal } from "../../equipamento-form-modal";
import { ManutencaoRegistroModal } from "../../manutencao-registro-modal";
import type { EquipamentoDTO, ChamadoDTO, ManutencaoRegistroDTO } from "../../types";

type EquipamentoFull = EquipamentoDTO & {
  chamados: (ChamadoDTO & { solicitante: { name: string }; responsavel: { name: string } | null })[];
  registros: ManutencaoRegistroDTO[];
  custoAcumulado: number;
};

const TABS = [
  { key: "visao-geral", label: "Visão geral", icon: LayoutDashboard },
  { key: "historico", label: "Histórico de manutenção", icon: Wrench },
  { key: "chamados", label: "Chamados", icon: ClipboardList },
  { key: "custos", label: "Custos", icon: FileText },
  { key: "documentos", label: "Documentos", icon: History },
] as const;

export function EquipamentoDetailClient({ equipamento }: { equipamento: EquipamentoFull }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("visao-geral");
  const [showEdit, setShowEdit] = useState(false);
  const [showRegistro, setShowRegistro] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="nord-card p-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          {equipamento.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={equipamento.fotoUrl} alt={equipamento.nome} className="w-16 h-16 rounded-xl object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-nord-panel flex items-center justify-center">
              <Wrench size={24} className="text-nord-gray" />
            </div>
          )}
          <div>
            <h2 className="text-white font-semibold text-lg">{equipamento.nome}</h2>
            <p className="text-xs text-nord-gray font-mono">{equipamento.codigo}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge tone={EQUIPAMENTO_STATUS_TONE[equipamento.status]}>{EQUIPAMENTO_STATUS_LABEL[equipamento.status]}</Badge>
              <span className="text-xs text-nord-gray">{equipamento.empresa.name} · {equipamento.setor}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setShowEdit(true)}>Editar equipamento</button>
          <button className="btn-primary" onClick={() => setShowRegistro(true)}>Registrar manutenção</button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
              tab === t.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "visao-geral" && (
        <Section title="Informações gerais">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <Info label="Categoria" value={equipamento.categoria} />
            <Info label="Localização" value={equipamento.localizacao ?? "—"} />
            <Info label="Marca" value={equipamento.marca ?? "—"} />
            <Info label="Modelo" value={equipamento.modelo ?? "—"} />
            <Info label="Número de série" value={equipamento.numeroSerie ?? "—"} />
            <Info label="Fornecedor" value={equipamento.fornecedor ?? "—"} />
            <Info label="Data da compra" value={equipamento.dataCompra ? format(new Date(equipamento.dataCompra), "dd/MM/yyyy") : "—"} />
            <Info label="Valor da compra" value={equipamento.valorCompra != null ? formatCurrency(equipamento.valorCompra) : "—"} />
            <Info label="Garantia até" value={equipamento.garantiaAte ? format(new Date(equipamento.garantiaAte), "dd/MM/yyyy") : "—"} />
            <Info label="Vida útil estimada" value={equipamento.vidaUtilEstimadaMeses ? `${equipamento.vidaUtilEstimadaMeses} meses` : "—"} />
            <Info label="Frequência de manutenção" value={MANUTENCAO_FREQUENCIA_LABEL[equipamento.frequenciaManutencao] ?? "—"} />
            <Info label="Prestador recomendado" value={equipamento.prestadorRecomendado ?? "—"} />
            <Info label="Última manutenção" value={equipamento.ultimaManutencaoEm ? format(new Date(equipamento.ultimaManutencaoEm), "dd/MM/yyyy") : "—"} />
            <Info label="Próxima manutenção" value={equipamento.proximaManutencaoEm ? format(new Date(equipamento.proximaManutencaoEm), "dd/MM/yyyy") : "—"} />
          </div>
          {equipamento.observacoes && (
            <div className="mt-4 pt-4 border-t border-nord-border/60">
              <p className="text-xs text-nord-gray mb-1">Observações</p>
              <p className="text-sm text-white">{equipamento.observacoes}</p>
            </div>
          )}
        </Section>
      )}

      {tab === "historico" && (
        <Section title="Histórico de manutenção">
          <div className="space-y-3">
            {equipamento.registros.map((r) => (
              <div key={r.id} className="border-b border-nord-border/50 pb-3 last:border-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-white text-sm font-medium">{format(new Date(r.data), "dd/MM/yyyy")} — {MANUTENCAO_TIPO_LABEL[r.tipo] ?? r.tipo}</span>
                  <span className="text-white text-sm">{formatCurrency(r.valorTotal)}</span>
                </div>
                <p className="text-xs text-nord-gray mt-1">{r.servicoExecutado}</p>
                <p className="text-xs text-nord-gray mt-0.5">Responsável: {r.responsavel.name}{r.prestador ? ` · Prestador: ${r.prestador}` : ""}</p>
              </div>
            ))}
            {equipamento.registros.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhuma manutenção registrada ainda.</p>}
          </div>
        </Section>
      )}

      {tab === "chamados" && (
        <Section title="Chamados vinculados">
          <div className="space-y-2">
            {equipamento.chamados.map((c) => (
              <a
                key={c.id}
                href={`/portal/manutencao/chamados/${c.id}`}
                className="flex items-center justify-between text-sm border-b border-nord-border/50 py-2 last:border-0 hover:bg-white/5 px-2 -mx-2 rounded"
              >
                <span className="text-white">{c.protocolo} — {c.titulo}</span>
                <Badge>{CHAMADO_STATUS_LABEL[c.status] ?? c.status}</Badge>
              </a>
            ))}
            {equipamento.chamados.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhum chamado vinculado.</p>}
          </div>
        </Section>
      )}

      {tab === "custos" && (
        <Section title="Custos acumulados">
          <p className="text-2xl font-semibold text-white mb-4">{formatCurrency(equipamento.custoAcumulado)}</p>
          <div className="space-y-2">
            {equipamento.registros.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm border-b border-nord-border/50 py-2 last:border-0">
                <span className="text-white">{format(new Date(r.data), "dd/MM/yyyy")} — {r.servicoExecutado}</span>
                <span className="text-white">{formatCurrency(r.valorTotal)}</span>
              </div>
            ))}
            {equipamento.registros.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhum custo registrado.</p>}
          </div>
        </Section>
      )}

      {tab === "documentos" && (
        <Section title="Documentos e galeria">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {equipamento.anexos?.map((a) => (
              <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="nord-card p-2 text-xs text-nord-blue-light hover:underline truncate">
                {a.name}
              </a>
            ))}
            {(!equipamento.anexos || equipamento.anexos.length === 0) && (
              <p className="text-sm text-nord-gray text-center py-6 col-span-full">Nenhum documento anexado.</p>
            )}
          </div>
        </Section>
      )}

      <EquipamentoFormModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        equipamento={equipamento}
        onSaved={() => {
          setShowEdit(false);
          router.refresh();
        }}
      />
      <ManutencaoRegistroModal
        open={showRegistro}
        onClose={() => setShowRegistro(false)}
        equipamentoId={equipamento.id}
        onSaved={() => {
          setShowRegistro(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-nord-gray">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}
