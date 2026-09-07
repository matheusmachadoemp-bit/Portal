import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { loadPurchaseByToken, receivingState } from "@/lib/recebimento-server";

/** Upload de fotos (mercadoria/divergência) a partir do link público de recebimento — sem sessão de usuário, validado pelo token. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const purchase = await loadPurchaseByToken(token);
  const state = receivingState(purchase);
  if (state !== "ok") {
    return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
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
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ["image/*"],
        addRandomSuffix: true,
        maximumSizeInBytes: 20 * 1024 * 1024,
        tokenPayload: JSON.stringify({ purchaseId: purchase!.id, pathname }),
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar a foto." },
      { status: 400 }
    );
  }
}
