import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { periodoLabel, proximoMesPeriodo, PERIODO_REGEX } from "@/lib/reuniao";
import { createMetaProximoMes, loadMetasProximoMes } from "@/lib/reuniao-server";

/**
 * Card "Metas de [nome do próximo mês]" da Reunião Delivery — mesmo mecanismo
 * de `/api/reuniao/gerente/metas-proximo-mes` (ver comentário lá), só
 * trocando `meetingKey` para "DELIVERY". Rota fina: toda a lógica fica em
 * `src/lib/reuniao-server.ts` (`loadMetasProximoMes`/`createMetaProximoMes`).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Reunião." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const periodoParam = searchParams.get("periodo");
  const periodo = periodoParam && PERIODO_REGEX.test(periodoParam) ? periodoParam : proximoMesPeriodo();

  const metas = ctx.mode === "single" ? await loadMetasProximoMes(ctx.empresa.id, "DELIVERY", periodo) : [];

  return NextResponse.json({ metas, periodo, periodoLabel: periodoLabel(periodo) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar metas na Reunião Delivery." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const periodo = body.periodo ? String(body.periodo).trim() : proximoMesPeriodo();
  if (!PERIODO_REGEX.test(periodo)) {
    return NextResponse.json({ error: "Período inválido (use o formato AAAA-MM)." }, { status: 400 });
  }

  const metrica = String(body.metrica ?? "").trim();
  if (!metrica) {
    return NextResponse.json({ error: "Informe a métrica da meta (ex.: CMV, Tempo Pedido)." }, { status: 400 });
  }

  const valorAlvo = String(body.valorAlvo ?? "").trim();
  if (!valorAlvo) {
    return NextResponse.json({ error: "Informe o valor-alvo da meta (ex.: 35%, 15min)." }, { status: 400 });
  }

  const valorPremio = Number(body.valorPremio) || 0;
  const destinatarioRaw = typeof body.destinatario === "string" ? body.destinatario.trim() : "";
  const destinatario = destinatarioRaw || "Equipe";

  const meta = await createMetaProximoMes({
    empresaId: empresa.id,
    meetingKey: "DELIVERY",
    periodo,
    metrica,
    valorAlvo,
    valorPremio,
    destinatario,
    createdById: session.user.id,
  });

  return NextResponse.json({ meta });
}
