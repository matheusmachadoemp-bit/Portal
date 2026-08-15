import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

const VALID_STATUSES = ["PENDENTE", "CONCILIADO", "IGNORADO"];
const VALID_MATCH_TYPES = ["PAYABLE", "RECEIVABLE"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json();
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  if (body.matchedType && !VALID_MATCH_TYPES.includes(body.matchedType)) {
    return NextResponse.json({ error: "Tipo de vínculo inválido." }, { status: 400 });
  }

  const manualMatch = body.matchedType && body.matchedId;
  // Ao sair de CONCILIADO (sem informar um novo vínculo), remove o vínculo existente.
  const clearMatch = body.status && body.status !== "CONCILIADO" && !manualMatch;

  const transaction = await prisma.bankTransaction.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      observacoes: body.observacoes ?? undefined,
      matchedType: manualMatch ? body.matchedType : clearMatch ? null : undefined,
      matchedId: manualMatch ? body.matchedId : clearMatch ? null : undefined,
    },
  });

  return NextResponse.json({ transaction });
}
