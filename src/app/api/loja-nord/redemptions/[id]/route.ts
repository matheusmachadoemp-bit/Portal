import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import {
  aprovarResgate,
  cancelarResgate,
  confirmarEntrega,
  marcarDisponivel,
  recusarResgate,
} from "@/lib/loja-nord-server";

const GESTOR_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

/**
 * Ações sobre um resgate:
 * - `cancelar`: o próprio colaborador, enquanto aguardando aprovação.
 * - `aprovar` / `recusar` / `disponivel` / `entregar`: gerente/proprietário.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "cancelar") {
    const result = await cancelarResgate(id, session.user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (!GESTOR_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para gerenciar resgates." }, { status: 403 });
  }

  const empresasPermitidas = (await getUserEmpresas(session.user.id, session.user.role)).map((e) => e.id);

  if (action === "aprovar") {
    const result = await aprovarResgate(
      id,
      session.user.id,
      body.dataPrevista ? new Date(body.dataPrevista) : undefined,
      empresasPermitidas
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "recusar") {
    const result = await recusarResgate(id, session.user.id, String(body.motivo ?? ""), empresasPermitidas);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "disponivel") {
    const result = await marcarDisponivel(id, empresasPermitidas);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "entregar") {
    const result = await confirmarEntrega(id, empresasPermitidas);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
