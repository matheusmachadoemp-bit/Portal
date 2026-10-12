import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { loadSupplierHistory } from "@/lib/compra-itens-server";

/**
 * Compras anteriores de um fornecedor da loja ativa: a última (para "Repetir última compra") e o último
 * preço de cada produto (sugestão de "combinado"). Usado ao registrar um boleto.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Financeiro." }, { status: 403 });
  }
  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) return NextResponse.json({ error: "Selecione uma loja específica." }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplierId");
  const fornecedor = searchParams.get("fornecedor") ?? "";
  if ((supplierId && supplierId.length > 100) || fornecedor.length > 200) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const history = await loadSupplierHistory(empresa.id, { supplierId: supplierId || null, fornecedor });
  return NextResponse.json(history);
}
