import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { loadCompraOfPayable } from "@/lib/compra-itens-server";

/** "O que foi comprado" de um boleto (compra + itens), para abrir a edição. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Financeiro." }, { status: 403 });
  }
  const { id } = await params;
  const payable = await prisma.payable.findUnique({ where: { id }, select: { id: true, empresaId: true } });
  if (!payable) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, payable.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const invoice = await loadCompraOfPayable(payable.id, payable.empresaId);
  if (!invoice) return NextResponse.json({ compra: null });
  return NextResponse.json({
    compra: {
      id: invoice.id,
      supplierId: invoice.supplierId,
      numeroNota: invoice.numeroNota,
      totalCobrado: invoice.totalCobrado,
      totalCombinado: invoice.totalCombinado,
      totalComparado: invoice.totalComparado,
      divergenciaStatus: invoice.divergenciaStatus,
      divergenciaMotivo: invoice.divergenciaMotivo,
      divergenciaObservacao: invoice.divergenciaObservacao,
      divergenciaResolvidaEm: invoice.divergenciaResolvidaEm,
      itens: invoice.items.map((it) => ({
        kind: it.kind,
        ingredientId: it.ingredientId,
        nome: it.nome,
        grupo: it.grupo,
        quantidade: it.quantidade,
        unidade: it.unidade,
        precoCombinado: it.precoCombinado,
        origemCombinado: it.origemCombinado,
        precoCobrado: it.precoCobrado,
      })),
    },
  });
}
