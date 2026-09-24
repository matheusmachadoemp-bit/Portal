import { headers } from "next/headers";
import {
  checkCustomerSurveyRateLimit,
  getPublicSurveyQuestions,
  getSelectableGarcons,
  resolveTableByToken,
  tableState,
} from "@/lib/customer-survey-server";
import { AvaliarClient } from "./avaliar-client";

const STATE_MESSAGE: Record<"invalido" | "inativa" | "rate-limited", { title: string; body: string }> = {
  invalido: {
    title: "Este link não é mais válido",
    body: "Confira se o QR Code foi escaneado corretamente. Se o problema continuar, chame um atendente.",
  },
  inativa: {
    title: "Mesa temporariamente indisponível",
    body: "Esta mesa não está aceitando avaliações no momento. Chame um atendente se precisar de ajuda.",
  },
  "rate-limited": {
    title: "Muitas tentativas",
    body: "Aguarde alguns minutos antes de tentar novamente.",
  },
};

/**
 * Fluxo público de avaliação (sem sessão) — resolve a mesa pelo token direto pelos helpers de
 * `@/lib/customer-survey-server` (mesmo padrão de `src/app/pesquisa/[token]/page.tsx`, RH: rate
 * limit primeiro, nunca revela em texto a diferença entre "token nunca existiu" e "mesa/loja
 * desativada" — só o `state` decide a tela). Middleware já libera `/avaliar` e
 * `/api/satisfacao-cliente/responder` como rotas públicas (`src/middleware.ts`).
 */
export default async function AvaliarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const allowed = await checkCustomerSurveyRateLimit(await headers(), token);
  const table = allowed ? await resolveTableByToken(token) : null;
  const state = allowed ? tableState(table) : ("rate-limited" as const);

  if (state !== "ok") {
    const msg = STATE_MESSAGE[state];
    return (
      <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-nord-panel border border-nord-border rounded-2xl p-6 text-center space-y-2">
          <h1 className="text-white font-semibold text-lg">{msg.title}</h1>
          <p className="text-nord-gray text-sm">{msg.body}</p>
        </div>
      </div>
    );
  }

  const empresaId = table!.empresaId;
  const [{ notaGeralQuestion, perguntas }, garcons] = await Promise.all([
    getPublicSurveyQuestions(empresaId),
    getSelectableGarcons(empresaId),
  ]);

  // Serializa só os campos que o formulário público precisa — mesmo racional de
  // `getSelectableGarcons`/`serializeQuestion` (GET /api/satisfacao-cliente/responder/[token]):
  // nunca vaza `empresaId`/timestamps/`ativo` pro client de uma página 100% pública.
  const serialize = (q: typeof notaGeralQuestion) => ({
    id: q.id,
    tipo: q.tipo,
    titulo: q.titulo,
    tema: q.tema,
    obrigatoria: q.obrigatoria,
  });

  return (
    <div className="min-h-screen w-full bg-nord-black">
      <AvaliarClient
        token={token}
        empresa={{ name: table!.empresa.name, color: table!.empresa.color, logo: table!.empresa.logo }}
        mesaNumero={table!.numero}
        notaGeral={serialize(notaGeralQuestion)}
        perguntas={perguntas.map(serialize)}
        garcons={garcons}
      />
    </div>
  );
}
