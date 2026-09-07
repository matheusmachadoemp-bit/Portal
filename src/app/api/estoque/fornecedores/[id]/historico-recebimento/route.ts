import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadSupplierReceivingHistory } from "@/lib/recebimento-server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const historico = await loadSupplierReceivingHistory(id);
  return NextResponse.json({ historico });
}
