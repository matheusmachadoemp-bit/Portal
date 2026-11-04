import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { hasModulePermission } from "@/lib/authz";
import type { PermissionAction } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";

// Esta rota não tinha NENHUM rate limit antes (achado do Jonas, auditoria de segurança 2026-11 —
// mesma categoria de achado já corrigida em `POST /api/feedback/[id]/anexos`, ver comentário lá):
// sem isso, qualquer sessão autenticada — mesmo uma sem nenhuma permissão de módulo concedida —
// podia disparar uploads de até 200MB em loop, sem nenhuma barreira, só consumindo cota de
// armazenamento (os blobs são `access: "public"`, então cada arquivo também fica acessível por
// URL — aleatória e difícil de adivinhar, mas pública — pra qualquer um que a descubra). Chave por
// usuário (não por IP): é uma rota autenticada, e várias pessoas atrás do mesmo IP (rede da loja)
// não devem compartilhar o mesmo contador. 60 por 10 minutos fica bem acima do uso legítimo mais
// pesado hoje (ex.: Universidade > Novo Curso anexando vários vídeos de uma vez).
const UPLOAD_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 60 };

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const withinLimit = await checkRateLimit(`upload:${session.user.id}`, UPLOAD_RATE_LIMIT);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Muitos envios em sequência. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Armazenamento de arquivos não configurado (BLOB_READ_WRITE_TOKEN ausente)." },
      { status: 500 }
    );
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayloadRaw) => {
        // Checagem de permissão por módulo (achado do Jonas, auditoria de segurança 2026-11): o
        // resto do sistema sempre checa `hasModulePermission` ANTES de persistir qualquer coisa
        // sensível, mas este endpoint é compartilhado por ~15 telas de módulos bem diferentes
        // (RH, Manutenção, Universidade, Marketing, Ficha Técnica, Loja Nord, Satisfação do
        // Cliente, Tarefas, Central de Bugs e Melhorias, foto de perfil...) — ele não sabe, só
        // pela requisição, para qual módulo/ação o arquivo é, então não dá para travar um módulo
        // fixo aqui sem quebrar os outros 14. Quem chama `upload()` no client PODE opcionalmente
        // informar isso via `clientPayload` (`JSON.stringify({ moduleKey, action })`): quando
        // informado, valida com a MESMA função (`hasModulePermission`) e o MESMO critério
        // (sem a permissão, nem o token de upload é emitido) que qualquer outra rota de
        // criar/editar do sistema já segue — fechando a lacuna de quem chamasse esta rota direto,
        // por fora da tela, sem ter a permissão de módulo que a tela exigiria antes de mostrar o
        // botão de enviar arquivo.
        //
        // Quando NÃO informado, o comportamento continua exatamente o de antes desta correção
        // (qualquer sessão autenticada) — de propósito: várias dessas telas são abertas a
        // QUALQUER usuário logado, independente de permissão de módulo nenhuma (ex.: Central de
        // Bugs e Melhorias — ver `POST /api/feedback/[id]/anexos`, onde "quem pode anexar" é
        // "quem criou o relato, ou Administrador", nunca `hasModulePermission`; ou trocar a
        // própria foto de perfil) — exigir uma permissão de módulo pra TODO upload quebraria
        // esses fluxos legítimos. Views futuras que queiram essa checagem (ou as já existentes,
        // numa tarefa separada de retrofit) só precisam passar `clientPayload`.
        if (clientPayloadRaw) {
          let moduleKey: unknown;
          let action: unknown;
          try {
            const parsed = JSON.parse(clientPayloadRaw) as { moduleKey?: unknown; action?: unknown };
            moduleKey = parsed.moduleKey;
            action = parsed.action;
          } catch {
            throw new Error("clientPayload inválido.");
          }
          if (typeof moduleKey === "string" && typeof action === "string") {
            const allowed = await hasModulePermission(session.user.id, moduleKey, action as PermissionAction);
            if (!allowed) {
              throw new Error("Seu perfil de permissão não permite enviar arquivos para este módulo.");
            }
          }
        }

        return {
          allowedContentTypes: [
            "image/*",
            "video/*",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.*",
            "application/vnd.ms-excel",
            "application/msword",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 200 * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId: session.user.id, pathname }),
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar o arquivo." },
      { status: 400 }
    );
  }
}
