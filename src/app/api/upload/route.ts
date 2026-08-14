import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import crypto from "crypto";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Armazenamento de arquivos não configurado (BLOB_READ_WRITE_TOKEN ausente)." },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `uploads/${crypto.randomUUID()}-${safeName}`;

  try {
    const blob = await put(fileName, file, { access: "public" });
    return NextResponse.json({
      fileUrl: blob.url,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao enviar o arquivo. Tente novamente." }, { status: 500 });
  }
}
