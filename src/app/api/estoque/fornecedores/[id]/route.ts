import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const supplier = await prisma.supplier.update({
    where: { id },
    data: {
      razaoSocial: body.razaoSocial ?? undefined,
      nomeFantasia: body.nomeFantasia !== undefined ? body.nomeFantasia || null : undefined,
      cnpj: body.cnpj !== undefined ? body.cnpj || null : undefined,
      telefone: body.telefone !== undefined ? body.telefone || null : undefined,
      whatsapp: body.whatsapp !== undefined ? body.whatsapp || null : undefined,
      email: body.email !== undefined ? body.email || null : undefined,
      endereco: body.endereco !== undefined ? body.endereco || null : undefined,
      prazoPagamentoDias: body.prazoPagamentoDias !== undefined ? (body.prazoPagamentoDias === "" ? null : Number(body.prazoPagamentoDias)) : undefined,
      prazoEntregaDias: body.prazoEntregaDias !== undefined ? (body.prazoEntregaDias === "" ? null : Number(body.prazoEntregaDias)) : undefined,
      pedidoMinimo: body.pedidoMinimo !== undefined ? (body.pedidoMinimo === "" ? null : Number(body.pedidoMinimo)) : undefined,
      avaliacao: body.avaliacao !== undefined ? Number(body.avaliacao) : undefined,
      active: body.active !== undefined ? !!body.active : undefined,
      observacao: body.observacao !== undefined ? body.observacao || null : undefined,
    },
  });
  return NextResponse.json({ supplier });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const inUse = await prisma.purchase.count({ where: { supplierId: id } });
  if (inUse > 0) {
    return NextResponse.json({ error: "Este fornecedor possui compras registradas e não pode ser excluído. Desative-o." }, { status: 400 });
  }
  await prisma.supplier.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
