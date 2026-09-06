import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";

const FIX_TOKEN = "nordportal-diag-blob-2026";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;
  const tokenPrefix = process.env.BLOB_READ_WRITE_TOKEN?.slice(0, 20) ?? null;

  if (!hasToken) {
    return NextResponse.json({ hasToken, tokenPrefix, listOk: false, error: "BLOB_READ_WRITE_TOKEN ausente" });
  }

  try {
    const result = await list({ limit: 1 });
    return NextResponse.json({ hasToken, tokenPrefix, listOk: true, blobCount: result.blobs.length });
  } catch (err) {
    return NextResponse.json({
      hasToken,
      tokenPrefix,
      listOk: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
