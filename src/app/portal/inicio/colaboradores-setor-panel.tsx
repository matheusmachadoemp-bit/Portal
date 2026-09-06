"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, HelpCircle, Users } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import type { ColaboradorSetor } from "@/lib/inicio";

// ---------------------------------------------------------------------------
// "Colaboradores do setor" — GET /api/inicio/colaboradores-setor?empresaId=X.
// Painel novo, exclusivo do perfil Líder (a rota devolve 403 para os demais
// perfis, mas isso nunca acontece nesta tela: só LiderDashboardClient usa
// este componente). Assim como rotina/alertas/Loja Nord, esta rota é sempre
// "o estado atual" (não depende de nenhum período selecionado em outro
// lugar da tela), então este painel só refaz a busca quando a loja ativa
// muda.
//
// `setor` pode vir `null` quando o sistema não consegue identificar o setor
// do Líder (ficha de RH sem ligação, ou o texto livre do setor não bate com
// nenhuma das convenções conhecidas — ver o comentário grande acima de
// `loadSetorDoLider` em src/lib/inicio.ts). Nesse caso mostramos uma
// explicação em vez de quebrar o restante da tela.
//
// `ColaboradorSetor` vem de src/lib/inicio.ts via `import type` (apagado na
// compilação — o Prisma usado lá dentro nunca entra no bundle do client) em
// vez de duplicado aqui — mesma prática já usada por alertas-panel.tsx e
// minha-meta-panel.tsx para não dessincronizar o formato se a rota ganhar
// campos novos no futuro.
// ---------------------------------------------------------------------------

type ColaboradoresSetorResponse = { setor: string | null; colaboradores: ColaboradorSetor[] };

/** Foto do colaborador (ficha de RH) ou inicial do nome — mesma ideia de `UserAvatar` em topbar/user-menu.tsx. */
function ColaboradorAvatar({ nome, avatarUrl }: { nome: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto vem do Vercel Blob (domínio variável), mesma abordagem de UserAvatar em topbar/user-menu.tsx
      <img src={avatarUrl} alt={nome} className="w-10 h-10 rounded-full object-cover shrink-0" />
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-nord-blue/20 text-nord-blue-light flex items-center justify-center text-sm font-semibold shrink-0">
      {nome.charAt(0).toUpperCase()}
    </div>
  );
}

function ColaboradorCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-nord-border animate-pulse">
      <div className="w-10 h-10 rounded-full bg-white/5 shrink-0" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="h-3 w-2/3 bg-white/5 rounded" />
        <div className="h-2.5 w-1/3 bg-white/5 rounded" />
      </div>
    </div>
  );
}

export function ColaboradoresSetorPanel({ empresaId }: { empresaId: string }) {
  const [dados, setDados] = useState<ColaboradoresSetorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/colaboradores-setor?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar os colaboradores do setor. Tente novamente em instantes.");
        return;
      }
      setDados(await res.json());
    } catch {
      setError("Não foi possível carregar os colaboradores do setor. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca os colaboradores do setor ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  const titulo = dados?.setor ? `Colaboradores de ${dados.setor}` : "Colaboradores do setor";

  return (
    <Section
      title={titulo}
      action={
        <Link
          href="/portal/rh/colaboradores"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium transition shrink-0"
        >
          Ver colaboradores <ArrowRight size={12} />
        </Link>
      }
    >
      <FormError message={error} />

      {dados === null ? (
        loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <ColaboradorCardSkeleton />
            <ColaboradorCardSkeleton />
            <ColaboradorCardSkeleton />
          </div>
        ) : null
      ) : dados.setor === null ? (
        <div className="flex items-start gap-2.5 py-2 text-sm text-nord-gray">
          <HelpCircle size={16} className="shrink-0 mt-0.5" />
          <p>Não conseguimos identificar seu setor automaticamente — fale com o RH para confirmar seu cadastro.</p>
        </div>
      ) : dados.colaboradores.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-nord-gray">
          <Users size={16} className="shrink-0" />
          Nenhum colaborador encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {dados.colaboradores.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-nord-border hover:border-white/20 transition-colors"
            >
              <ColaboradorAvatar nome={c.nome} avatarUrl={c.avatarUrl} />
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate">{c.nome}</p>
                <p className="text-xs text-nord-gray truncate">{c.cargo}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
