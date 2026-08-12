"use client";

import Link from "next/link";
import { Plus, Megaphone } from "lucide-react";
import { Badge, Section } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/calc";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE, CAMPAIGN_CHANNEL_LABEL, CAMPAIGN_OFFER_LABEL } from "@/lib/crm";

type Row = {
  id: string;
  name: string;
  status: string;
  channel: string;
  offerType: string;
  audienceType: string;
  recipientCount: number;
  lojaNome: string;
  lojaColor: string;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export function CampanhasClient({ rows, canCreate }: { rows: Row[]; canCreate: boolean }) {
  return (
    <Section
      title={`Campanhas (${rows.length})`}
      action={
        canCreate && (
          <Link
            href="/portal/crm/campanhas/novo"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light text-white"
          >
            <Plus size={13} /> Nova Campanha
          </Link>
        )
      }
    >
      {rows.length === 0 ? (
        <div className="text-center py-10">
          <Megaphone size={28} className="text-nord-gray/40 mx-auto mb-2" />
          <p className="text-sm text-nord-gray">Nenhuma campanha criada ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/portal/crm/campanhas/${c.id}`}
              className="rounded-xl border border-nord-border p-4 space-y-2.5 hover:border-nord-blue/50 transition block"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-white text-sm font-semibold">{c.name}</p>
                <Badge tone={CAMPAIGN_STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-nord-gray">
                <span className="px-2 py-0.5 rounded-full bg-white/5">{CAMPAIGN_CHANNEL_LABEL[c.channel]}</span>
                <span className="px-2 py-0.5 rounded-full bg-white/5">{CAMPAIGN_OFFER_LABEL[c.offerType]}</span>
              </div>
              <p className="text-xs text-nord-gray">
                {formatNumber(c.recipientCount)} clientes ·{" "}
                {c.sentAt
                  ? `enviada em ${new Date(c.sentAt).toLocaleDateString("pt-BR")}`
                  : c.scheduledAt
                    ? `agendada para ${new Date(c.scheduledAt).toLocaleDateString("pt-BR")}`
                    : "rascunho"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}
