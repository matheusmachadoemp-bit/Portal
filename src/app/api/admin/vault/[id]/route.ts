import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { decryptSecret, encryptSecret } from "@/lib/vault";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para acessar o cofre de senhas." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "VIEW";

  const entry = await prisma.vaultEntry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.vaultAccessLog.create({
    data: { vaultEntryId: id, userId: session.user.id, action },
  });

  // `decryptSecret` lança quando o ciphertext salvo está corrompido/em formato inválido (ex.:
  // GCM com tag de autenticação alterada) — sem este try/catch, isso derrubava a rota com um
  // 500 cru. Mensagem genérica (sem detalhe interno) de propósito: é um erro de dado salvo, não
  // algo que o usuário possa corrigir sozinho reenviando a requisição.
  try {
    return NextResponse.json({ password: decryptSecret(entry.passwordCipher) });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível decifrar a senha salva. Edite este registro e cadastre a senha novamente." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para editar o cofre de senhas." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {
    systemName: body.systemName ?? undefined,
    site: body.site ?? undefined,
    username: body.username ?? undefined,
    category: body.category ?? undefined,
    responsavel: body.responsavel ?? undefined,
    observacao: body.observacao ?? undefined,
  };
  if (body.password) data.passwordCipher = encryptSecret(body.password);

  await prisma.vaultEntry.update({ where: { id }, data });
  await prisma.vaultHistory.create({
    data: {
      vaultEntryId: id,
      changedBy: session.user.name ?? session.user.email ?? "",
      changeType: "UPDATE",
    },
  });
  await prisma.vaultAccessLog.create({
    data: { vaultEntryId: id, userId: session.user.id, action: "EDIT" },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para excluir do cofre de senhas." },
      { status: 403 }
    );
  }
  const { id } = await params;
  await prisma.vaultEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
