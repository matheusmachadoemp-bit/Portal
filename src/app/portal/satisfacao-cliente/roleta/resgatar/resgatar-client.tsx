"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { CheckCircle2 } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";
import { FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";

/** Mesmo fallback visual da tela de administração de prêmios (`roleta-client.tsx`) — só exibição,
 *  usado quando o prêmio não tem imagem nem ícone escolhido. */
const DEFAULT_PRIZE_ICON = "Gift";

type SpinResultDTO = {
  id: string;
  codigo: string;
  resgatadoEm: string;
  resgatadoPor: { id: string; name: string | null };
  premio: { id: string; nome: string; descricao: string | null; imagemUrl: string | null; icone: string | null };
};

type ResgatarResponse = { ok: true; spin: SpinResultDTO };

export function ResgatarClient() {
  const [codigo, setCodigo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpinResultDTO | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (submitting) return;
    if (!codigo.trim()) {
      setError("Digite o código do prêmio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<ResgatarResponse>("/api/satisfacao-cliente/roleta/resgatar", "POST", { codigo });
      if (!res.ok) {
        setError(res.error);
        setResult(null);
        return;
      }
      setResult(res.data.spin);
      setCodigo("");
    } finally {
      setSubmitting(false);
    }
  }

  function novoResgate() {
    setResult(null);
    setError(null);
    setCodigo("");
    inputRef.current?.focus();
  }

  return (
    <div className="max-w-md mx-auto w-full space-y-6">
      <p className="text-sm text-nord-gray text-center">
        Peça o código que o cliente recebeu ao girar a roleta e digite abaixo para liberar o prêmio.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="nord-card p-6 space-y-4"
      >
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1.5">Código do prêmio</span>
          <input
            ref={inputRef}
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Ex.: AB12CD34EF56"
            maxLength={20}
            disabled={submitting}
            className="input text-center text-lg tracking-widest font-mono uppercase disabled:opacity-60"
          />
        </label>

        <FormError message={error} />

        <button
          type="submit"
          disabled={submitting || !codigo.trim()}
          className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-3"
        >
          {submitting ? "Verificando..." : "Resgatar"}
        </button>
      </form>

      {result && (
        <div className="nord-card p-6 border-t-2 border-nord-success flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-nord-success/15 flex items-center justify-center">
            <CheckCircle2 size={26} className="text-nord-success" />
          </div>
          <p className="text-sm text-nord-success font-medium">Prêmio resgatado com sucesso!</p>

          {result.premio.imagemUrl ? (
            <Image
              src={result.premio.imagemUrl}
              alt={result.premio.nome}
              width={96}
              height={96}
              className="w-24 h-24 rounded-xl object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-xl bg-nord-panel flex items-center justify-center text-nord-gray">
              <DynamicIcon name={result.premio.icone || DEFAULT_PRIZE_ICON} size={40} />
            </div>
          )}

          <div>
            <p className="text-white text-lg font-semibold">{result.premio.nome}</p>
            {result.premio.descricao && <p className="text-sm text-nord-gray mt-1">{result.premio.descricao}</p>}
          </div>

          <div className="text-xs text-nord-gray border-t border-nord-border/60 pt-3 w-full">
            Código <code className="bg-nord-panel px-1.5 py-0.5 rounded">{result.codigo}</code> resgatado em{" "}
            {format(new Date(result.resgatadoEm), "dd/MM/yyyy 'às' HH:mm")}
            {result.resgatadoPor.name ? ` por ${result.resgatadoPor.name}` : ""}.
          </div>

          <button
            onClick={novoResgate}
            className="w-full mt-2 border border-nord-border text-nord-gray hover:text-white hover:border-white/30 text-sm font-medium rounded-lg py-2.5"
          >
            Resgatar outro código
          </button>
        </div>
      )}
    </div>
  );
}
