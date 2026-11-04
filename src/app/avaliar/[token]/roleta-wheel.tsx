"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Check, Copy, Frown, Gift, PartyPopper, Sparkles, Star, Trophy } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";

/** Mesmo fallback visual das telas de administração da Roleta (`roleta-client.tsx`,
 *  `resgatar-client.tsx`) — só exibição, usado quando o prêmio não tem imagem nem ícone escolhido. */
const DEFAULT_PRIZE_ICON = "Gift";

type PremioGanho = { id: string; nome: string; descricao: string | null; imagemUrl: string | null; icone: string | null };

type ResultadoGiro =
  | { tipo: "premio"; codigo: string; validadeAte: string; premio: PremioGanho }
  | { tipo: "tente_novamente" };

// Cores e ícones puramente decorativos (não existe, nesta tela pública/sem sessão, nenhum
// endpoint que devolva o catálogo real de prêmios da loja — só o admin autenticado tem acesso a
// `GET /api/satisfacao-cliente/roleta/premios`). A roda gira sempre com as mesmas 8 fatias
// genéricas, repetindo as cores oficiais da paleta (`DESIGN_SYSTEM.md`); o resultado de verdade
// (prêmio ganho ou "tente novamente") só é conhecido depois da resposta de
// `POST .../responder/[token]/girar` e é exibido como texto, não como a fatia em que a roda parou.
const SLICE_COLORS = ["#1464f4", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];
const SLICE_ICONS = [Gift, Star, Trophy, Sparkles, Gift, Star, Trophy, Sparkles];
const SLICE_DEG = 360 / SLICE_COLORS.length;

const WHEEL_GRADIENT = `conic-gradient(from 0deg, ${SLICE_COLORS.map((color, i) => `${color} ${i * SLICE_DEG}deg ${(i + 1) * SLICE_DEG}deg`).join(", ")})`;

/** Duração mínima da animação de giro (ms) — garante a mesma "dramaticidade" mesmo quando a API
 *  responde quase instantaneamente (evita o resultado aparecer antes da roda sequer girar). */
const MIN_SPIN_MS = 2600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function RoletaWheel({ spinning, rotation }: { spinning: boolean; rotation: number }) {
  return (
    <div className="relative w-56 h-56 mx-auto select-none">
      {/* Ponteiro fixo (não gira) */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[11px] border-r-[11px] border-t-[18px] border-l-transparent border-r-transparent border-t-nord-blue-light" />

      {/* Face da roda — gira via `transform` */}
      <div
        className="absolute inset-2 rounded-full border-4 border-nord-border shadow-2xl"
        style={{
          background: WHEEL_GRADIENT,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 2600ms cubic-bezier(0.12, 0.65, 0.1, 1)" : "none",
        }}
      >
        {SLICE_ICONS.map((Icon, i) => {
          const angle = i * SLICE_DEG + SLICE_DEG / 2;
          return (
            <div key={i} className="absolute inset-0" style={{ transform: `rotate(${angle}deg)` }}>
              <div className="absolute top-3 left-1/2 -translate-x-1/2" style={{ transform: `rotate(${-angle}deg)` }}>
                <Icon size={18} className="text-white/85" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Miolo central (estático, por cima da roda) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-14 h-14 rounded-full bg-nord-card border-2 border-nord-border flex items-center justify-center shadow-lg">
          <Gift size={22} className="text-nord-blue-light" />
        </div>
      </div>
    </div>
  );
}

/**
 * Etapa pública da Roleta de Prêmios, exibida depois que o cliente termina a pesquisa de
 * satisfação (ver `avaliar-client.tsx`) — chama `POST /api/satisfacao-cliente/responder/[token]/girar`
 * (contrato documentado em `src/app/api/satisfacao-cliente/responder/[token]/route.ts` e a lógica
 * de sorteio em `src/lib/roulette-server.ts`, nenhum dos dois editado aqui).
 *
 * Roda sempre para QUALQUER loja que use a pesquisa de satisfação pública, sem checar antes se
 * aquela loja tem prêmios cadastrados — não existe (nem é necessário) um campo "roleta ativa" por
 * loja: o próprio backend já trata "nenhum prêmio ativo" exatamente como "Tente novamente" com
 * 100% de chance (ver comentário de `sortearPremio`/`executarGiro` em `roulette-server.ts`), então
 * o mesmo fluxo cobre os dois casos sem distinção nenhuma no client.
 */
export function RoletaFlow({
  token,
  responseId,
  nomeCliente,
  empresaNome,
}: {
  token: string;
  responseId: string;
  nomeCliente: string;
  empresaNome: string;
}) {
  const [phase, setPhase] = useState<"intro" | "girando" | "resultado">("intro");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoGiro | null>(null);
  const [rotation, setRotation] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const copiadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiadoTimer.current) clearTimeout(copiadoTimer.current);
    };
  }, []);

  async function aguardarRestante(inicio: number) {
    const passado = Date.now() - inicio;
    if (passado < MIN_SPIN_MS) await sleep(MIN_SPIN_MS - passado);
  }

  async function girar() {
    if (phase === "girando") return;
    setErro(null);
    setPhase("girando");
    // Giro puramente decorativo (ver nota acima da roda) — várias voltas completas + um ângulo
    // aleatório, sem nenhuma relação com o resultado real devolvido pela API.
    setRotation((r) => r + 1800 + Math.floor(Math.random() * 360));

    const inicio = Date.now();
    try {
      const res = await fetch(`/api/satisfacao-cliente/responder/${token}/girar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId }),
      });
      const data = await res.json().catch(() => ({}));
      await aguardarRestante(inicio);
      if (!res.ok) {
        setErro(data?.error || "Não foi possível girar a roleta agora. Tente novamente.");
        setPhase("intro");
        return;
      }
      if (data.resultado === "premio") {
        setResultado({ tipo: "premio", codigo: data.codigo, validadeAte: data.validadeAte, premio: data.premio });
      } else {
        setResultado({ tipo: "tente_novamente" });
      }
      setPhase("resultado");
    } catch {
      await aguardarRestante(inicio);
      setErro("Falha de conexão. Verifique sua internet e tente novamente.");
      setPhase("intro");
    }
  }

  async function copiarCodigo(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      if (copiadoTimer.current) clearTimeout(copiadoTimer.current);
      copiadoTimer.current = setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Clipboard indisponível (ex.: contexto não seguro) — o código já fica visível na tela pra
      // copiar manualmente, sem necessidade de feedback de erro aqui.
    }
  }

  if (phase === "resultado" && resultado?.tipo === "premio") {
    const { premio, codigo, validadeAte } = resultado;
    return (
      <div className="w-full max-w-sm text-center space-y-4" aria-live="polite">
        <PartyPopper size={40} className="text-nord-success mx-auto" />
        <div>
          <h1 className="text-white font-semibold text-lg">Parabéns, você ganhou um prêmio!</h1>
          <p className="text-nord-gray text-sm mt-1">Obrigado por avaliar a {empresaNome}.</p>
        </div>

        <div className="nord-card p-5 border-t-2 border-nord-success flex flex-col items-center gap-3">
          {premio.imagemUrl ? (
            <Image src={premio.imagemUrl} alt={premio.nome} width={88} height={88} className="w-20 h-20 rounded-xl object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-nord-panel flex items-center justify-center text-nord-blue-light">
              <DynamicIcon name={premio.icone || DEFAULT_PRIZE_ICON} size={36} />
            </div>
          )}
          <div>
            <p className="text-white text-base font-semibold">{premio.nome}</p>
            {premio.descricao && <p className="text-xs text-nord-gray mt-1">{premio.descricao}</p>}
          </div>

          <div className="w-full pt-3 border-t border-nord-border/60 space-y-2">
            <p className="text-[11px] text-nord-gray">Mostre este código ao atendente para resgatar:</p>
            <button
              type="button"
              onClick={() => copiarCodigo(codigo)}
              className="w-full flex items-center justify-center gap-2 bg-nord-panel border border-nord-border rounded-lg py-2.5 font-mono text-lg tracking-widest text-white hover:border-nord-blue transition"
            >
              {codigo}
              {copiado ? <Check size={16} className="text-nord-success shrink-0" /> : <Copy size={16} className="text-nord-gray shrink-0" />}
            </button>
            <p className="text-[11px] text-nord-gray">
              {copiado ? "Código copiado!" : `Válido até ${format(new Date(validadeAte), "dd/MM/yyyy")}.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "resultado") {
    return (
      <div className="w-full max-w-sm text-center space-y-3" aria-live="polite">
        <Frown size={40} className="text-nord-gray mx-auto" />
        <h1 className="text-white font-semibold text-lg">Não foi dessa vez!</h1>
        <p className="text-nord-gray text-sm">
          Mas não desanime — continue nos visitando, você pode ganhar um prêmio em uma próxima avaliação. Obrigado por
          avaliar a {empresaNome}!
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm text-center space-y-5">
      <div>
        <h1 className="text-white font-semibold text-lg">{nomeCliente ? `Obrigado, ${nomeCliente}!` : "Obrigado!"}</h1>
        <p className="text-nord-gray text-sm mt-1">Sua avaliação foi enviada com sucesso. Agora gire a roleta e teste sua sorte!</p>
      </div>

      <RoletaWheel spinning={phase === "girando"} rotation={rotation} />

      {erro && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-2.5" aria-live="polite">
          <p className="text-xs text-red-300">{erro}</p>
        </div>
      )}

      <button
        type="button"
        onClick={girar}
        disabled={phase === "girando"}
        className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white text-sm font-medium rounded-lg py-3"
      >
        {phase === "girando" ? "Girando..." : erro ? "Tentar novamente" : "Girar a roleta"}
      </button>
    </div>
  );
}
