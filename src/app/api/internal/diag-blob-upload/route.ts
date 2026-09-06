import { NextRequest, NextResponse } from "next/server";
import { list, put, del } from "@vercel/blob";

const FIX_TOKEN = "nordportal-diag-blob-2026";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "Unauthorized", tokenReceived: token }, { status: 401 });
  }

  const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;
  const tokenPrefix = process.env.BLOB_READ_WRITE_TOKEN?.slice(0, 20) ?? null;

  if (!hasToken) {
    return NextResponse.json({ hasToken, tokenPrefix, listOk: false, error: "BLOB_READ_WRITE_TOKEN ausente" });
  }

  const diag: Record<string, unknown> = { hasToken, tokenPrefix };

  try {
    const result = await list({ limit: 1 });
    diag.listOk = true;
    diag.blobCount = result.blobs.length;
  } catch (err) {
    diag.listOk = false;
    diag.listError = err instanceof Error ? err.message : String(err);
  }

  try {
    const testBlob = await put("diag-test.txt", "ok", { access: "public", addRandomSuffix: true });
    diag.writeOk = true;
    diag.writeUrl = testBlob.url;
    await del(testBlob.url);
    diag.deleteOk = true;
  } catch (err) {
    diag.writeOk = false;
    diag.writeError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(diag);
}
