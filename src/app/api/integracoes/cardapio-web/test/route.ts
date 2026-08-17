import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { decryptSecret } from "@/lib/vault";
import { diagnoseCardapioWebConnection } from "@/lib/cardapio-web-client";

/** Testa a conexão Open Delivery e grava o resultado bruto para diagnóstico manual. */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para testar esta integração." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica (não é possível testar no modo Grupo Nord)." }, { status: 400 });
  }
  if (!empresa.cardapioWebEstablishmentId || !empresa.cardapioWebSecret) {
    return NextResponse.json({ error: "Configure o Id e o Segredo do Estabelecimento antes de testar." }, { status: 400 });
  }

  const secret = decryptSecret(empresa.cardapioWebSecret);
  const result = await diagnoseCardapioWebConnection(empresa.cardapioWebEstablishmentId, secret);

  await prisma.empresa.update({
    where: { id: empresa.id },
    data: { cardapioWebLastTestAt: new Date(), cardapioWebLastTestResult: JSON.stringify(result) },
  });

  return NextResponse.json(result);
}
