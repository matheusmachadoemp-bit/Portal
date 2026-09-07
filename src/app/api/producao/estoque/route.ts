import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { lancarProductionStockMovement, PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";

const ALLOWED_TYPES = ["SALDO_ANTERIOR", "AJUSTE", "PERDA"] as const;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode lançar movimentos de estoque pronto." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para lançar estoque pronto." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.productionItemId || !ALLOWED_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "Informe o produto e o tipo de movimento." }, { status: 400 });
  }
  const quantidade = Number(body.quantidade);
  if (!Number.isFinite(quantidade) || quantidade < 0) {
    return NextResponse.json({ error: "Informe uma quantidade válida." }, { status: 400 });
  }

  const stock = await lancarProductionStockMovement(
    body.productionItemId,
    empresa.id,
    session.user.id,
    body.type,
    quantidade,
    body.motivo || null
  );

  return NextResponse.json({ stock });
}
