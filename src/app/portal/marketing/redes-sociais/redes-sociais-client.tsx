"use client";

import { useState } from "react";
import { Section, Badge, StatCard } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatNumber, formatPercent, growth, pct } from "@/lib/calc";
import { SOCIAL_NETWORK_OPTIONS } from "@/lib/marketing";

const NETWORK_ICON: Record<string, string> = {
  Instagram: "Instagram",
  Facebook: "Facebook",
  TikTok: "Music2",
  Google: "Search",
  WhatsApp: "MessageCircle",
  Site: "Globe",
  YouTube: "Youtube",
};

type EntrySummary = {
  seguidoresInicio: number;
  seguidoresFim: number;
  alcance: number;
  impressoes: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
};

type PostResumo = { id: string; title: string; format: string | null; category: string | null; socialNetwork: string | null };

const TABS = [
  { key: "geral", label: "Visão geral", icon: "LayoutDashboard" },
  { key: "instagram", label: "Instagram Orgânico", icon: "Instagram" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function RedesSociaisClient({
  current,
  previous,
  countsByNetwork,
  instagramUsername,
}: {
  current: EntrySummary | undefined;
  previous: EntrySummary | undefined;
  countsByNetwork: { network: string; posts: PostResumo[] }[];
  instagramUsername: string | null;
}) {
  const [tab, setTab] = useState<TabKey>("geral");

  const totalInteracoes = current ? current.curtidas + current.comentarios + current.compartilhamentos + current.salvamentos : 0;
  const engajamento = current ? pct(totalInteracoes, current.alcance || current.seguidoresFim) : 0;
  const novosSeguidores = current ? current.seguidoresFim - current.seguidoresInicio : 0;
  const novosSeguidoresAnterior = previous ? previous.seguidoresFim - previous.seguidoresInicio : 0;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="Seções de Redes Sociais">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-white transition-colors ${
              tab === t.key ? "border-nord-blue bg-nord-blue" : "border-nord-border hover:border-nord-blue/60"
            }`}
          >
            <DynamicIcon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "geral" && (
        <>
          <SortableStatCards
            storageKey="marketing-redes-sociais-kpi-order"
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
            cards={[
              { key: "seguidores", label: "Seguidores", value: formatNumber(current?.seguidoresFim ?? 0), icon: "Users" },
              {
                key: "novos-seguidores-mes",
                label: "Novos seguidores (mês)",
                value: formatNumber(novosSeguidores),
                icon: "UserPlus",
                delta: previous ? growth(novosSeguidores, novosSeguidoresAnterior) : null,
              },
              { key: "alcance", label: "Alcance", value: formatNumber(current?.alcance ?? 0), icon: "Radar" },
              { key: "impressoes", label: "Impressões", value: formatNumber(current?.impressoes ?? 0), icon: "Eye" },
              { key: "engajamento", label: "Engajamento", value: formatPercent(engajamento), icon: "Heart" },
              { key: "compartilhamentos", label: "Compartilhamentos", value: formatNumber(current?.compartilhamentos ?? 0), icon: "Share2" },
            ]}
          />

          <Section title="Interações do último período">
            <SortableStatCards
              storageKey="marketing-redes-sociais-engajamento-kpi-order"
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
              cards={[
                { key: "curtidas", label: "Curtidas", value: formatNumber(current?.curtidas ?? 0), icon: "Heart", color: "#ef4444" },
                { key: "comentarios", label: "Comentários", value: formatNumber(current?.comentarios ?? 0), icon: "MessageCircle", color: "#3b82f6" },
                { key: "compartilhamentos-interacoes", label: "Compartilhamentos", value: formatNumber(current?.compartilhamentos ?? 0), icon: "Share2", color: "#22c55e" },
                { key: "salvamentos", label: "Salvamentos", value: formatNumber(current?.salvamentos ?? 0), icon: "Bookmark", color: "#eab308" },
              ]}
            />
          </Section>

          <Section title="Melhores conteúdos publicados por rede">
            {countsByNetwork.length === 0 ? (
              <p className="text-sm text-nord-gray">Nenhum conteúdo publicado com rede social definida ainda.</p>
            ) : (
              <div className="space-y-5">
                {countsByNetwork.map(({ network, posts }) => (
                  <div key={network}>
                    <div className="flex items-center gap-2 mb-2">
                      <DynamicIcon name={NETWORK_ICON[network] ?? "Share2"} size={15} className="text-nord-blue-light" />
                      <h4 className="text-white text-sm font-medium">{network}</h4>
                      <Badge>{posts.length} publicados</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {posts.slice(0, 6).map((p) => (
                        <div key={p.id} className="nord-card p-3">
                          <p className="text-white text-sm truncate">{p.title}</p>
                          <p className="text-xs text-nord-gray">{p.format ?? "—"} · {p.category ?? "—"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      {tab === "instagram" && (
        <InstagramOrganicoView
          current={current}
          previous={previous}
          novosSeguidores={novosSeguidores}
          novosSeguidoresAnterior={novosSeguidoresAnterior}
          engajamento={engajamento}
          username={instagramUsername}
        />
      )}
    </div>
  );
}

/**
 * Dados reais do perfil do Instagram, sincronizados junto com o Meta Ads
 * (a API de seguidores usa a mesma conexão — Configurações > Meta Ads).
 */
function InstagramOrganicoView({
  current,
  previous,
  novosSeguidores,
  novosSeguidoresAnterior,
  engajamento,
  username,
}: {
  current: EntrySummary | undefined;
  previous: EntrySummary | undefined;
  novosSeguidores: number;
  novosSeguidoresAnterior: number;
  engajamento: number;
  username: string | null;
}) {
  if (!current) {
    return (
      <div className="nord-card p-6 text-center">
        <DynamicIcon name="Instagram" size={28} className="text-nord-gray mx-auto mb-3" />
        <p className="text-white text-sm font-medium mb-1">Instagram ainda não sincronizou dados</p>
        <p className="text-xs text-nord-gray max-w-md mx-auto">
          Conecte a conta do Instagram vinculada ao Meta Ads em Configurações &gt; Meta Ads — os seguidores e o alcance
          reais aparecem aqui automaticamente depois da primeira sincronização.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {username && (
        <a
          href={`https://instagram.com/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-nord-blue-light hover:underline w-fit"
        >
          <DynamicIcon name="Instagram" size={16} />@{username}
        </a>
      )}
      <p className="text-xs text-nord-gray">Dados reais sincronizados da conta do Instagram vinculada ao Meta Ads.</p>
      <SortableStatCards
        storageKey="redes-sociais-instagram-kpi-order"
        className="grid grid-cols-2 md:grid-cols-3 gap-4"
        cards={[
          { key: "seguidores", label: "Seguidores", value: formatNumber(current.seguidoresFim), icon: "Users", color: "#1464F4" },
          {
            key: "novos-seguidores",
            label: "Novos seguidores (mês)",
            value: formatNumber(novosSeguidores),
            icon: "UserPlus",
            color: "#3b82f6",
            delta: previous ? growth(novosSeguidores, novosSeguidoresAnterior) : null,
          },
          { key: "alcance", label: "Alcance", value: formatNumber(current.alcance), icon: "Radar", color: "#a855f7" },
          { key: "impressoes", label: "Impressões", value: formatNumber(current.impressoes), icon: "Eye", color: "#22c55e" },
          { key: "engajamento", label: "Engajamento", value: formatPercent(engajamento), icon: "Heart", color: "#ef4444" },
        ]}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Curtidas" value={formatNumber(current.curtidas)} icon="Heart" color="#ef4444" />
        <StatCard label="Comentários" value={formatNumber(current.comentarios)} icon="MessageCircle" color="#3b82f6" />
        <StatCard label="Compartilhamentos" value={formatNumber(current.compartilhamentos)} icon="Share2" color="#22c55e" />
        <StatCard label="Salvamentos" value={formatNumber(current.salvamentos)} icon="Bookmark" color="#eab308" />
      </div>
    </div>
  );
}
