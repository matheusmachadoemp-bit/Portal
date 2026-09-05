import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cancelarResgate } from "@/lib/loja-nord-server";

/** Cancela um resgate próprio, ainda aguardando aprovação. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "cancelar") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const result = await cancelarResgate(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
