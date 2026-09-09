import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

/**
 * Cancela uma assinatura de push (usuário desativou notificação pela UI de
 * opt-in, ou o navegador invalidou a assinatura). Só apaga a linha se o
 * `endpoint` pertencer ao usuário logado — nunca deixa um usuário apagar a
 * assinatura de outro só por conhecer/adivinhar o endpoint. Aceita DELETE
 * (verbo mais correto pra cancelamento) e POST (mais simples de disparar
 * via `navigator.sendBeacon`/fetch em alguns fluxos do cliente) com o mesmo
 * comportamento.
 */
async function unsubscribe(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint é obrigatório." }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } });

  return NextResponse.json({ ok: true });
}

export const POST = unsubscribe;
export const DELETE = unsubscribe;
