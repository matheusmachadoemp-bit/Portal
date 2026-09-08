import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertEmpresaAccess, requireActiveSingleEmpresa } from "@/lib/empresa";
import { lancarAjusteManual } from "@/lib/loja-nord-server";
import { hasModulePermission } from "@/lib/authz";

const GESTOR_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];
const KINDS = ["BONIFICACAO", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"];

/** Lança uma bonificação ou ajuste manual de pontos para um colaborador. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!GESTOR_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para lançar pontos." }, { status: 403 });
  }
  // Mesmo critério já usado em crm/fidelidade/ajustar: lançamento manual de pontos para outro
  // colaborador é tratado como canEdit (na prática, quase sempre um ajuste sobre um saldo já
  // existente), não canCreate.
  if (!(await hasModulePermission(session.user.id, "loja-nord", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar pontos." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para lançar pontos." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.userId || !KINDS.includes(body?.kind) || !Number.isFinite(Number(body?.pontos))) {
    return NextResponse.json({ error: "Preencha colaborador, tipo e quantidade de pontos." }, { status: 400 });
  }
  if (!body?.descricao?.trim()) {
    return NextResponse.json({ error: "Descreva o motivo do lançamento." }, { status: 400 });
  }

  // O saldo de pontos é único por colaborador (não por loja): sem essa checagem, um
  // gestor/supervisor da loja ativa poderia lançar bonificação ou ajuste negativo pro userId de
  // um colaborador de outra loja, afetando um saldo que essa pessoa pode resgatar depois.
  // Confere acesso do colaborador ALVO (não de quem está logado) à loja ativa antes de aplicar.
  const targetUser = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, role: true } });
  if (!targetUser) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }
  if (!(await assertEmpresaAccess(targetUser.id, targetUser.role, empresa.id))) {
    return NextResponse.json({ error: "Esse colaborador não pertence a esta loja." }, { status: 403 });
  }

  const result = await lancarAjusteManual({
    userId: body.userId,
    empresaId: empresa.id,
    pontos: Number(body.pontos),
    kind: body.kind,
    descricao: body.descricao,
    justificativa: String(body.justificativa ?? ""),
    criadoPorId: session.user.id,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
