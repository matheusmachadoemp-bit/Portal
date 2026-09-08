"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";

// ---------------------------------------------------------------------------
// "Equipe de hoje" — GET /api/inicio/equipe-hoje?empresaId=X. Assim como os
// demais painéis desta tela (rotina, alertas, metas, Loja Nord), esta rota
// não depende do período selecionado no topo da tela (é sempre "hoje"),
// então este painel só refaz a busca quando a loja ativa muda.
//
// "De folga" não ganha uma seção própria aqui de propósito: a API sempre
// devolve essa lista vazia (não existe no sistema uma escala/turno que diga
// quem está programado pra folgar num dia específico — não é bug, é
// limitação real de dado, ver comentário em src/lib/inicio.ts acima de
// `loadEquipeOcorrenciasHoje`). Se esse dado passar a existir, esta seção
// pode ganhar seu próprio bloco igual aos de ausências/atestados/atrasos
// abaixo.
// ---------------------------------------------------------------------------

type EquipeHojePessoa = { id: string; nome: string; avatarUrl: string | null };
type EquipeHojeOcorrencia = { id: string; nome: string; tipo: string };
type EquipeHojeAtestado = { id: string; nome: string };
type EquipeHojeAtraso = { id: string; nome: string; minutosAtraso: number };

type EquipeHojeResponse = {
  presentes: EquipeHojePessoa[];
  totalPresentes: number;
  ausencias: EquipeHojeOcorrencia[];
  atestados: EquipeHojeAtestado[];
  atrasos: EquipeHojeAtraso[];
};

const MAX_AVATARS = 10;

/** Foto do colaborador (ficha de RH) ou iniciais — mesma ideia de `UserAvatar` em topbar/user-menu.tsx, adaptada para a fileira sobreposta de avatares. */
function TeamAvatar({ nome, avatarUrl }: { nome: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto vem do Vercel Blob (domínio variável), mesma abordagem de UserAvatar em topbar/user-menu.tsx
      <img
        src={avatarUrl}
        alt={nome}
        title={nome}
        className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-nord-card"
      />
    );
  }
  return (
    <div
      title={nome}
      className="w-8 h-8 rounded-full bg-nord-blue/20 text-nord-blue-light flex items-center justify-center text-xs font-semibold shrink-0 ring-2 ring-nord-card"
    >
      {nome.charAt(0).toUpperCase()}
    </div>
  );
}

function EquipeHojeSkeleton() {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="flex -space-x-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="w-8 h-8 rounded-full bg-white/5 ring-2 ring-nord-card" />
        ))}
      </div>
      <div className="h-3 w-20 bg-white/5 rounded" />
    </div>
  );
}

export function EquipeHojePanel({ empresaId }: { empresaId: string }) {
  const [dados, setDados] = useState<EquipeHojeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/equipe-hoje?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar a equipe de hoje. Tente novamente em instantes.");
        return;
      }
      setDados(await res.json());
    } catch {
      setError("Não foi possível carregar a equipe de hoje. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a equipe de hoje ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  const temOcorrencia = dados
    ? dados.ausencias.length > 0 || dados.atestados.length > 0 || dados.atrasos.length > 0
    : false;

  return (
    <Section
      title="Equipe de hoje"
      action={
        <Link
          href="/portal/rh/ponto-eletronico"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium transition shrink-0"
        >
          Ver ponto eletrônico <ArrowRight size={12} />
        </Link>
      }
    >
      <FormError message={error} />

      {dados === null ? (
        loading ? (
          <EquipeHojeSkeleton />
        ) : null
      ) : (
        <div className="space-y-4">
          {dados.presentes.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-sm text-nord-gray">
              <Users size={16} className="shrink-0" />
              Ninguém bateu ponto hoje ainda.
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex -space-x-2">
                {dados.presentes.slice(0, MAX_AVATARS).map((p) => (
                  <TeamAvatar key={p.id} nome={p.nome} avatarUrl={p.avatarUrl} />
                ))}
                {dados.presentes.length > MAX_AVATARS && (
                  <div className="w-8 h-8 rounded-full bg-nord-panel text-nord-gray flex items-center justify-center text-[11px] font-medium shrink-0 ring-2 ring-nord-card">
                    +{dados.presentes.length - MAX_AVATARS}
                  </div>
                )}
              </div>
              <span className="text-sm text-white font-medium">
                {dados.totalPresentes} {dados.totalPresentes === 1 ? "presente" : "presentes"}
              </span>
            </div>
          )}

          {temOcorrencia && (
            <div className="space-y-2 pt-3 border-t border-nord-border">
              {dados.ausencias.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap">
                  <Badge tone="danger">Faltas hoje</Badge>
                  <p className="text-xs text-nord-gray flex-1 min-w-[160px]">
                    {dados.ausencias.map((a) => a.nome).join(", ")}
                  </p>
                </div>
              )}
              {dados.atestados.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap">
                  <Badge tone="info">Atestados</Badge>
                  <p className="text-xs text-nord-gray flex-1 min-w-[160px]">
                    {dados.atestados.map((a) => a.nome).join(", ")}
                  </p>
                </div>
              )}
              {dados.atrasos.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap">
                  <Badge tone="warning">Atrasos</Badge>
                  <p className="text-xs text-nord-gray flex-1 min-w-[160px]">
                    {dados.atrasos.map((a) => `${a.nome} (${a.minutosAtraso} min)`).join(", ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
