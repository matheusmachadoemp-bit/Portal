import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const body = await req.json();
  const cliente = await prisma.cliente.findFirst({
    where: { id: body.clienteId, empresaId: { in: empresaIdsForContext(ctx) } },
  });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  // Faz upsert da LoyaltyAccount do cliente (na prática quase sempre já existe, criada no
  // primeiro ganho de pontos) e sempre cria uma nova LoyaltyTransaction — na maior parte do uso
  // real é um ajuste manual num saldo já existente, por isso trata como canEdit.
  if (!(await hasModulePermission(session.user.id, "crm", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ajustar pontos de fidelidade." },
      { status: 403 }
    );
  }

  const tipo: "GANHO" | "RESGATE" = body.tipo === "RESGATE" ? "RESGATE" : "GANHO";
  const pontos = Number(body.pontos) || 0;
  const cashback = Number(body.cashback) || 0;
  const sinal = tipo === "GANHO" ? 1 : -1;

  // Ajuste manual de STAFF (diferente do resgate self-service de prêmio do
  // Loja Nord, achado #180): decisão consciente de manter a flexibilidade de
  // deixar o saldo negativo em vez de bloquear com erro duro — pode ser
  // intencional (ex.: corrigir/zerar para baixo um saldo de cliente que
  // estava errado), e quem aciona isso é sempre um funcionário com permissão
  // de `canEdit`, nunca o próprio cliente. Em vez de bloquear, avisamos
  // claramente no retorno quando o resultado fica negativo (campo
  // `warning`), para a tela mostrar um aviso — ver observação no relatório
  // final sobre a tela hoje não ler nenhum campo desta resposta.
  const account = await prisma.$transaction(async (tx) => {
    const acc = await tx.loyaltyAccount.upsert({
      where: { clienteId: cliente.id },
      update: { pontos: { increment: pontos * sinal }, cashback: { increment: cashback * sinal } },
      create: { empresaId: cliente.empresaId, clienteId: cliente.id, pontos: pontos * sinal, cashback: cashback * sinal },
    });

    await tx.loyaltyTransaction.create({
      data: { accountId: acc.id, tipo, pontos, cashback, descricao: body.descricao ?? null },
    });

    return acc;
  });

  const saldosNegativos: string[] = [];
  if (account.pontos < 0) saldosNegativos.push(`pontos (${account.pontos})`);
  if (account.cashback < 0) saldosNegativos.push(`cashback (R$ ${account.cashback.toFixed(2)})`);
  const warning =
    saldosNegativos.length > 0
      ? `Atenção: este ajuste deixou o saldo de ${saldosNegativos.join(" e ")} do cliente negativo.`
      : null;

  return NextResponse.json({ account, warning });
}
