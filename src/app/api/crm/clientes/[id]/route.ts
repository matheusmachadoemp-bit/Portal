import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { normalizeTelefoneDedupe } from "@/lib/crm";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const cliente = await prisma.cliente.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (!(await hasModulePermission(session.user.id, "crm", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar clientes." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("nome" in body) data.nome = String(body.nome).trim();
  // Normaliza pra só dígitos (igual importação CSV e fluxo de Reservas, achado do Mylon, tarefa
  // #191) — sem isso, editar o telefone aqui manualmente gravava a máscara digitada ("(11)
  // 98888-7777") direto em `Cliente.telefone`, e o cross-reference de Reservas (que busca por
  // igualdade exata de dígitos) nunca encontrava este cadastro.
  if ("telefone" in body) {
    const telefoneRaw = typeof body.telefone === "string" ? body.telefone.trim() : "";
    data.telefone = telefoneRaw ? normalizeTelefoneDedupe(telefoneRaw) : null;
  }
  if ("whatsapp" in body) data.whatsapp = body.whatsapp || null;
  if ("email" in body) data.email = body.email || null;
  if ("dataNascimento" in body) data.dataNascimento = body.dataNascimento ? new Date(body.dataNascimento) : null;
  if ("endereco" in body) data.endereco = body.endereco || null;
  if ("bairro" in body) data.bairro = body.bairro || null;
  if ("cidade" in body) data.cidade = body.cidade || null;

  const updated = await prisma.cliente.update({ where: { id }, data });
  return NextResponse.json({ cliente: updated });
}
