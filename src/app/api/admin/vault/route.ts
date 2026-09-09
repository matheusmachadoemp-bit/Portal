import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { encryptSecret } from "@/lib/vault";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para acessar o cofre de senhas." },
      { status: 403 }
    );
  }

  // Lista nunca mostra a senha (só um endpoint dedicado revela, com log de
  // acesso em VaultAccessLog) — não há motivo para trazer `passwordCipher`
  // (o blob cifrado) do banco aqui, então usamos `select` em vez do padrão
  // "todas as colunas".
  const entries = await prisma.vaultEntry.findMany({
    orderBy: { systemName: "asc" },
    select: {
      id: true,
      systemName: true,
      site: true,
      username: true,
      category: true,
      responsavel: true,
      observacao: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
    },
  });

  const sanitized = entries.map((e) => ({
    id: e.id,
    systemName: e.systemName,
    site: e.site,
    username: e.username,
    category: e.category,
    responsavel: e.responsavel,
    observacao: e.observacao,
    updatedAt: e.updatedAt.toISOString(),
    createdBy: e.createdBy.name,
  }));

  return NextResponse.json({ entries: sanitized });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para cadastrar senhas no cofre." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const entry = await prisma.vaultEntry.create({
    data: {
      systemName: body.systemName,
      site: body.site || null,
      username: body.username,
      passwordCipher: encryptSecret(body.password || ""),
      category: body.category || "Geral",
      responsavel: body.responsavel || null,
      observacao: body.observacao || null,
      createdById: session.user.id,
      history: { create: { changedBy: session.user.name ?? session.user.email ?? "", changeType: "CREATE" } },
    },
  });

  return NextResponse.json({ id: entry.id });
}
