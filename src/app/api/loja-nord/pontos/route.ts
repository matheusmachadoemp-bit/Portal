import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { lancarAjusteManual } from "@/lib/loja-nord-server";

const GESTOR_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];
const KINDS = ["BONIFICACAO", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"];

/** Lança uma bonificação ou ajuste manual de pontos para um colaborador. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!GESTOR_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para lançar pontos." }, { status: 403 });
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
