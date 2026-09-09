import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

/**
 * Recebe o objeto de assinatura de Web Push que o navegador devolve depois
 * de `registration.pushManager.subscribe(...)` (feito pela UI de opt-in, uma
 * etapa futura) e grava associado ao usuário logado. `endpoint` identifica o
 * par navegador+dispositivo — um mesmo usuário pode ter várias assinaturas
 * (celular, notebook etc.), por isso o upsert é por `endpoint`, não por
 * usuário: se o mesmo navegador assinar de novo (ex.: outro usuário loga
 * nesse aparelho depois), a assinatura passa a apontar pro usuário atual.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const authKey = typeof body?.keys?.auth === "string" ? body.keys.auth : null;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "Assinatura de push inválida — endpoint e keys.p256dh/keys.auth são obrigatórios." }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: session.user.id, p256dh, auth: authKey },
    create: { userId: session.user.id, endpoint, p256dh, auth: authKey },
  });

  return NextResponse.json({ ok: true });
}
