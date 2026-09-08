"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CalendarClock, ClipboardList, AlertTriangle, PauseCircle } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";

// ---------------------------------------------------------------------------
// "Resumo de manutenção" — GET /api/inicio/manutencao-resumo?empresaId=X.
// Assim como alertas (mesma restrição de acesso: perfilPodeVerAlertas), esta
// rota não depende do período selecionado no topo da tela (é sempre
// "agora"), então este painel só refaz a busca quando a loja ativa muda.
//
// Os 3 números em destaque batem com os KPIs de mesmo nome já mostrados no
// dashboard da Central de Manutenção (/portal/manutencao) — mesmos ícones e
// cores de lá (src/app/portal/manutencao/manutencao-dashboard-client.tsx),
// pra manter a identidade visual entre as duas telas.
//
// Chamados/equipamentos (ChamadosClient/EquipamentosClient) ainda não têm
// filtro controlado pela URL, então os números levam para a tela geral de
// cada um em vez de um link já filtrado.
// ---------------------------------------------------------------------------

type ManutencaoResumoResponse = {
  chamadosAbertos: number;
  chamadosUrgentes: number;
  equipamentosParados: number;
  proximaManutencaoProgramada: { titulo: string; data: string } | null;
};

function NumeroDestaque({
  href,
  icon: Icon,
  color,
  label,
  value,
}: {
  href: string;
  icon: LucideIcon;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <Link href={href} className="nord-card p-4 flex items-center gap-3 hover:border-white/20 transition-colors">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}22` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-nord-gray text-xs truncate">{label}</p>
        <p className="text-white text-2xl font-semibold tracking-tight">{formatNumber(value)}</p>
      </div>
    </Link>
  );
}

function ManutencaoResumoSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="h-[68px] bg-white/5 rounded-xl" />
        <div className="h-[68px] bg-white/5 rounded-xl" />
        <div className="h-[68px] bg-white/5 rounded-xl" />
      </div>
      <div className="h-3 w-2/3 bg-white/5 rounded" />
    </div>
  );
}

export function ManutencaoResumoPanel({ empresaId }: { empresaId: string }) {
  const [dados, setDados] = useState<ManutencaoResumoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/manutencao-resumo?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar o resumo de manutenção. Tente novamente em instantes.");
        return;
      }
      setDados(await res.json());
    } catch {
      setError("Não foi possível carregar o resumo de manutenção. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca o resumo de manutenção ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  return (
    <Section
      title="Resumo de manutenção"
      action={
        <Link
          href="/portal/manutencao"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium transition shrink-0"
        >
          Acessar Manutenção <ArrowRight size={12} />
        </Link>
      }
    >
      <FormError message={error} />

      {dados === null ? (
        loading ? (
          <ManutencaoResumoSkeleton />
        ) : null
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <NumeroDestaque
              href="/portal/manutencao/chamados"
              icon={ClipboardList}
              color="#1464f4"
              label="Chamados abertos"
              value={dados.chamadosAbertos}
            />
            <NumeroDestaque
              href="/portal/manutencao/chamados"
              icon={AlertTriangle}
              color="#ef4444"
              label="Chamados urgentes"
              value={dados.chamadosUrgentes}
            />
            <NumeroDestaque
              href="/portal/manutencao/equipamentos"
              icon={PauseCircle}
              color="#ef4444"
              label="Equipamentos parados"
              value={dados.equipamentosParados}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs pt-3 border-t border-nord-border">
            <span className="text-nord-gray flex items-center gap-1.5 shrink-0">
              <CalendarClock size={14} />
              Próxima manutenção programada
            </span>
            {dados.proximaManutencaoProgramada ? (
              <span className="text-white font-medium">
                {dados.proximaManutencaoProgramada.titulo} —{" "}
                {format(new Date(dados.proximaManutencaoProgramada.data), "dd/MM/yyyy")}
              </span>
            ) : (
              <span className="text-nord-gray">Nenhuma manutenção programada</span>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
