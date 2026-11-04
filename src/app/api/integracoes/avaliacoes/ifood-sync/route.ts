import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { syncEmpresaReviews, defaultReviewSyncRange, type ReviewSyncMode } from "@/lib/review-sync";
import { hasModulePermission } from "@/lib/authz";

// Avaliações — Fase 1 (só iFood). MESMO padrão de autenticação/estrutura de
// `src/app/api/integracoes/ifood/sync/route.ts` (sincronização de PEDIDOS): `POST` manual
// autenticado por sessão/permissão (botões "Simular"/"Sincronizar agora" em Avaliações >
// Configurações), `GET` agendado autenticado por `CRON_SECRET` (ver vercel.json) — o `GET`
// SEMPRE roda em modo real (nunca simula sozinho via cron).
//
// Diferente da sincronização de pedidos, o `POST` em modo real (`mode` ausente/"real" no corpo
// — padrão) só processa a empresa se `avaliacoesAutoReplyEnabled` estiver `true` — ver prompt
// da tarefa "avaliacoes-ifood-fase1": a geração/publicação automática de resposta só roda "para
// cada empresa com credenciais válidas E avaliacoesAutoReplyEnabled=true". O `GET` do cron
// aplica o mesmo filtro na própria query (`where: { avaliacoesAutoReplyEnabled: true }`).
//
// `mode: "simulate"` no corpo do `POST` (botão "Simular") é a EXCEÇÃO deliberada a essa regra —
// adicionada depois do Matheus notar que, sem ela, a única forma de "ver como as respostas
// ficam" seria ligar o toggle de verdade (que já publica): gera a resposta e checa a
// palavra-chave de risco normalmente, mas NUNCA publica no iFood (ver `src/lib/review-sync.ts`)
// — por isso funciona mesmo com o toggle desligado, só precisa da credencial do iFood
// configurada (pra buscar as avaliações de verdade e simular contra elas).
const REVIEW_SYNC_MODES: ReviewSyncMode[] = ["real", "simulate"];

/**
 * Disparo manual (botões "Simular"/"Sincronizar agora" em Avaliações > Configurações). Mesmo
 * gate de cargo/permissão de `src/app/api/integracoes/ifood/sync/route.ts`, só que no módulo
 * "avaliacoes" em vez de "configuracoes" — é este módulo que controla quem pode operar
 * Avaliações.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "avaliacoes", "canExecute"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite sincronizar as avaliações do iFood." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível sincronizar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const mode: ReviewSyncMode = REVIEW_SYNC_MODES.includes(body?.mode) ? body.mode : "real";

  if (mode === "real" && !empresa.avaliacoesAutoReplyEnabled) {
    return NextResponse.json(
      {
        error:
          "A resposta automática de avaliações está desligada para esta loja. Ative o toggle em Avaliações > Configurações antes de sincronizar — ou use o botão \"Simular\" para ver como as respostas ficariam sem publicar nada.",
      },
      { status: 400 }
    );
  }

  const result = await syncEmpresaReviews(empresa, defaultReviewSyncRange(), mode);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ...result, mode });
}

/** Disparo agendado (Vercel Cron, ver vercel.json), autenticado via CRON_SECRET. */
export async function GET(req: Request) {
  // Comparação timing-safe (ver src/lib/cron-auth.ts) — achado do Jonas, auditoria de
  // segurança 2026-11: comparação de string simples (`===`) é vulnerável a timing attack.
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const empresas = await prisma.empresa.findMany({
    where: {
      active: true,
      avaliacoesAutoReplyEnabled: true,
      ifoodClientId: { not: null },
      ifoodClientSecretCipher: { not: null },
      ifoodMerchantId: { not: null },
    },
    select: { id: true, name: true, ifoodClientId: true, ifoodClientSecretCipher: true, ifoodMerchantId: true },
  });

  const range = defaultReviewSyncRange();
  const results = await Promise.all(
    empresas.map(async (empresa) => ({
      empresaId: empresa.id,
      // Sempre modo "real" — o cron nunca simula sozinho (ver comentário no topo do arquivo).
      result: await syncEmpresaReviews(empresa, range, "real"),
    }))
  );

  return NextResponse.json({ synced: results.length, results });
}
