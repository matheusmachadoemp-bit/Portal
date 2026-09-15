import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { getStoreActiveUsers } from "@/lib/manutencao-server";
import { hasModulePermission } from "@/lib/authz";

/**
 * Configuração de "quem recebe notificação de chamado novo" (Manutenção >
 * Configurações > Notificações) — só a parte de notificação; limites de
 * aprovação financeira ficam para uma etapa futura (não fazem parte desta
 * rota). Escopado pela loja ativa: não faz sentido configurar isso no modo
 * Grupo Nord consolidado, cada loja tem sua própria lista de destinatários.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Manutenção." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica para ver as configurações de notificação." },
      { status: 400 }
    );
  }

  const [users, destinatarios] = await Promise.all([
    getStoreActiveUsers(empresa.id),
    prisma.manutencaoNotificacaoDestinatario.findMany({
      where: { empresaId: empresa.id },
      select: { userId: true },
    }),
  ]);

  return NextResponse.json({
    // Usuários ativos da loja disponíveis para escolher no seletor.
    users,
    // Subconjunto de `users` (por id) marcado como destinatário hoje.
    configuredUserIds: destinatarios.map((d) => d.userId),
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "manutencao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações de Manutenção." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica para alterar as configurações de notificação." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!Array.isArray(body.userIds) || body.userIds.some((id: unknown) => typeof id !== "string")) {
    return NextResponse.json({ error: "userIds deve ser uma lista de ids de usuário." }, { status: 400 });
  }

  const requestedIds = Array.from(new Set<string>(body.userIds));

  // Nunca confia cegamente nos ids recebidos: só aceita usuários que
  // realmente têm acesso a esta loja (mesma lista que populou o seletor),
  // evitando configurar alguém sem acesso ou um id inexistente/de outra loja.
  const validUsers = await getStoreActiveUsers(empresa.id);
  const validIds = new Set(validUsers.map((u) => u.id));
  const invalidIds = requestedIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: "Um ou mais usuários selecionados não têm acesso a esta loja." },
      { status: 400 }
    );
  }

  // Substitui a lista inteira da loja (apaga tudo e recria) — mais simples
  // e menos propenso a erro do que calcular um diff incremental.
  await prisma.$transaction([
    prisma.manutencaoNotificacaoDestinatario.deleteMany({ where: { empresaId: empresa.id } }),
    ...(requestedIds.length > 0
      ? [
          prisma.manutencaoNotificacaoDestinatario.createMany({
            data: requestedIds.map((userId) => ({ empresaId: empresa.id, userId })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true, configuredUserIds: requestedIds });
}
