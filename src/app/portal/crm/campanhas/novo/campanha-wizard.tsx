"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Users, Megaphone, Gift, MessageSquare, CalendarClock } from "lucide-react";
import { formatNumber } from "@/lib/calc";
import { CAMPAIGN_CHANNEL_LABEL, CAMPAIGN_OFFER_LABEL } from "@/lib/crm";

type AudienceType = "TODOS" | "SEGMENTO" | "CLIENTES";
type Channel = "WHATSAPP" | "SMS" | "EMAIL" | "PUSH";
type OfferType = "CUPOM" | "DESCONTO_PERCENTUAL" | "DESCONTO_VALOR" | "PRODUTO_GRATIS" | "CASHBACK" | "PONTOS" | "SEM_OFERTA";

const STEPS = [
  { key: "publico", label: "Público", icon: Users },
  { key: "canal", label: "Canal", icon: Megaphone },
  { key: "oferta", label: "Oferta", icon: Gift },
  { key: "mensagem", label: "Mensagem", icon: MessageSquare },
  { key: "agendamento", label: "Agendamento", icon: CalendarClock },
];

export function CampanhaWizard({
  autoSegments,
  segmentosSalvos,
  totalClientes,
  clientesPreselecionados,
  initialAudienceType,
  initialAutoSegmento,
  initialSegmentoId,
}: {
  autoSegments: { key: string; name: string; count: number }[];
  segmentosSalvos: { id: string; name: string }[];
  totalClientes: number;
  clientesPreselecionados: { id: string; nome: string }[];
  initialAudienceType: AudienceType;
  initialAutoSegmento: string | null;
  initialSegmentoId: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>(initialAudienceType);
  const [autoSegmento, setAutoSegmento] = useState<string | null>(initialAutoSegmento);
  const [segmentoId, setSegmentoId] = useState<string | null>(initialSegmentoId);
  const [channel, setChannel] = useState<Channel>("WHATSAPP");
  const [offerType, setOfferType] = useState<OfferType>("SEM_OFERTA");
  const [offerValue, setOfferValue] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [message, setMessage] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audienceCount =
    audienceType === "TODOS"
      ? totalClientes
      : audienceType === "CLIENTES"
        ? clientesPreselecionados.length
        : (autoSegmento ? autoSegments.find((s) => s.key === autoSegmento)?.count : undefined) ?? undefined;

  function canAdvance() {
    if (step === 0) {
      if (audienceType === "SEGMENTO") return !!autoSegmento || !!segmentoId;
      if (audienceType === "CLIENTES") return clientesPreselecionados.length > 0;
      return true;
    }
    if (step === 3) return message.trim().length > 0;
    if (step === 4 && !sendNow) return !!scheduledAt;
    return true;
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/crm/campanhas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || "Campanha sem nome",
        audienceType,
        segmentId: audienceType === "SEGMENTO" ? segmentoId : null,
        autoSegmentoKey: audienceType === "SEGMENTO" ? autoSegmento : null,
        clienteIds: audienceType === "CLIENTES" ? clientesPreselecionados.map((c) => c.id) : [],
        channel,
        offerType,
        offerValue: offerValue ? Number(offerValue) : null,
        offerDescription: offerDescription || null,
        message,
        sendNow,
        scheduledAt: !sendNow ? scheduledAt : null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível criar a campanha.");
      setSubmitting(false);
      return;
    }
    const { campanha } = await res.json();
    router.push(`/portal/crm/campanhas/${campanha.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="nord-card p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da campanha (ex: Volta pra Zarki)"
          className="w-full bg-transparent text-white text-lg font-medium outline-none placeholder:text-nord-gray/50"
        />
      </div>

      <div className="flex items-center gap-1 overflow-x-auto nord-scrollbar pb-1">
        {STEPS.map((s, idx) => (
          <button
            key={s.key}
            onClick={() => idx < step && setStep(idx)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              idx === step ? "bg-nord-blue text-white" : idx < step ? "text-emerald-400" : "text-nord-gray"
            }`}
          >
            {idx < step ? <Check size={13} /> : <s.icon size={13} />}
            {idx + 1}. {s.label}
          </button>
        ))}
      </div>

      <div className="nord-card p-6 min-h-[320px]">
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="text-white font-medium">Selecione o público</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["TODOS", "SEGMENTO", "CLIENTES"] as AudienceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setAudienceType(t)}
                  className={`p-4 rounded-xl border text-left ${audienceType === t ? "border-nord-blue bg-nord-blue/10" : "border-nord-border hover:border-nord-blue/40"}`}
                >
                  <p className="text-white text-sm font-medium">
                    {t === "TODOS" ? "Todos os clientes" : t === "SEGMENTO" ? "Segmento" : "Clientes específicos"}
                  </p>
                  <p className="text-xs text-nord-gray mt-1">
                    {t === "TODOS" && `${formatNumber(totalClientes)} clientes na base`}
                    {t === "SEGMENTO" && "Automático ou personalizado"}
                    {t === "CLIENTES" && `${clientesPreselecionados.length} selecionados`}
                  </p>
                </button>
              ))}
            </div>

            {audienceType === "SEGMENTO" && (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-nord-gray">Segmentos automáticos</p>
                <div className="flex flex-wrap gap-2">
                  {autoSegments.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => {
                        setAutoSegmento(s.key);
                        setSegmentoId(null);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${autoSegmento === s.key ? "border-nord-blue bg-nord-blue/15 text-white" : "border-nord-border text-nord-gray"}`}
                    >
                      {s.name} · {formatNumber(s.count)}
                    </button>
                  ))}
                </div>
                {segmentosSalvos.length > 0 && (
                  <>
                    <p className="text-xs text-nord-gray pt-2">Segmentos personalizados</p>
                    <div className="flex flex-wrap gap-2">
                      {segmentosSalvos.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSegmentoId(s.id);
                            setAutoSegmento(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs border ${segmentoId === s.id ? "border-nord-blue bg-nord-blue/15 text-white" : "border-nord-border text-nord-gray"}`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {audienceType === "CLIENTES" && (
              <div className="pt-2">
                {clientesPreselecionados.length === 0 ? (
                  <p className="text-xs text-amber-400">
                    Nenhum cliente selecionado. Volte para a página de Clientes e selecione os clientes desejados antes
                    de criar a campanha.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {clientesPreselecionados.map((c) => (
                      <span key={c.id} className="px-2 py-1 rounded-full text-[11px] bg-white/5 text-white">
                        {c.nome}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {audienceCount !== undefined && (
              <p className="text-xs text-nord-gray pt-1">Alcance estimado: {formatNumber(audienceCount)} clientes</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-white font-medium">Selecione o canal</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(Object.keys(CAMPAIGN_CHANNEL_LABEL) as Channel[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`p-4 rounded-xl border text-center ${channel === c ? "border-nord-blue bg-nord-blue/10 text-white" : "border-nord-border text-nord-gray hover:border-nord-blue/40"}`}
                >
                  {CAMPAIGN_CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
            <p className="text-xs text-nord-gray">
              O envio efetivo por WhatsApp/SMS/E-mail/Push depende da integração com o provedor de mensageria
              (preparado para integração futura). Por enquanto, a campanha é registrada e os resultados são medidos
              pelas compras reais dos clientes após o envio.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-white font-medium">Configure a oferta</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(Object.keys(CAMPAIGN_OFFER_LABEL) as OfferType[]).map((o) => (
                <button
                  key={o}
                  onClick={() => setOfferType(o)}
                  className={`px-3 py-2 rounded-lg text-xs border ${offerType === o ? "border-nord-blue bg-nord-blue/15 text-white" : "border-nord-border text-nord-gray"}`}
                >
                  {CAMPAIGN_OFFER_LABEL[o]}
                </button>
              ))}
            </div>
            {offerType !== "SEM_OFERTA" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {(offerType === "DESCONTO_PERCENTUAL" || offerType === "DESCONTO_VALOR" || offerType === "CASHBACK" || offerType === "PONTOS") && (
                  <div>
                    <label className="block text-xs text-nord-gray mb-1.5">
                      {offerType === "DESCONTO_PERCENTUAL" ? "Percentual (%)" : offerType === "PONTOS" ? "Pontos" : "Valor (R$)"}
                    </label>
                    <input
                      type="number"
                      value={offerValue}
                      onChange={(e) => setOfferValue(e.target.value)}
                      className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-nord-gray mb-1.5">Descrição da oferta</label>
                  <input
                    value={offerDescription}
                    onChange={(e) => setOfferDescription(e.target.value)}
                    placeholder="Ex: Batata grátis no pedido"
                    className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h3 className="text-white font-medium">Mensagem da campanha</h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder={"Ex: Olá {{nome}}, sentimos sua falta! Volte à Zarki Sushi e ganhe 15% de desconto no seu próximo pedido."}
              className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-nord-blue resize-none"
            />
            <p className="text-[11px] text-nord-gray">
              Use <code className="text-nord-blue-light">{"{{nome}}"}</code> para personalizar com o nome do cliente.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-white font-medium">Agendamento</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSendNow(true)}
                className={`p-4 rounded-xl border text-center ${sendNow ? "border-nord-blue bg-nord-blue/10 text-white" : "border-nord-border text-nord-gray"}`}
              >
                Enviar agora
              </button>
              <button
                onClick={() => setSendNow(false)}
                className={`p-4 rounded-xl border text-center ${!sendNow ? "border-nord-blue bg-nord-blue/10 text-white" : "border-nord-border text-nord-gray"}`}
              >
                Agendar envio
              </button>
            </div>
            {!sendNow && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
              />
            )}

            <div className="rounded-xl border border-nord-border p-4 space-y-1.5 text-sm">
              <p className="text-white font-medium">Resumo</p>
              <p className="text-nord-gray text-xs">Público: {audienceCount !== undefined ? `${formatNumber(audienceCount)} clientes` : "—"}</p>
              <p className="text-nord-gray text-xs">Canal: {CAMPAIGN_CHANNEL_LABEL[channel]}</p>
              <p className="text-nord-gray text-xs">Oferta: {CAMPAIGN_OFFER_LABEL[offerType]}</p>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="px-4 py-2 rounded-lg text-sm border border-nord-border text-nord-gray hover:text-white disabled:opacity-40"
        >
          Voltar
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canAdvance() && setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canAdvance()}
            className="px-5 py-2 rounded-lg text-sm bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
          >
            Próximo
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canAdvance() || submitting}
            className="px-5 py-2 rounded-lg text-sm bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
          >
            {submitting ? "Criando..." : sendNow ? "Criar e enviar" : "Agendar campanha"}
          </button>
        )}
      </div>
    </div>
  );
}
