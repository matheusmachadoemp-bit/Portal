import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        allowedContentTypes: [
          "image/*",
          "video/*",
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.*",
          "application/vnd.ms-excel",
          "application/msword",
          "text/*",
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 200 * 1024 * 1024,
        tokenPayload: JSON.stringify({ userId: session.user.id, pathname }),
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar o arquivo." },
      { status: 400 }
    );
  }
}
