import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { createReuniaoCustomIndicator, parseSecondaryIndicatorFields, REUNIAO_INDICATOR_UNIDADES } from "@/lib/reuniao-server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar indicadores na Reunião Gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar indicadores no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const nome = String(body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe um nome para o indicador." }, { status: 400 });

  const unidade = REUNIAO_INDICATOR_UNIDADES.includes(body.unidade) ? body.unidade : "PERCENT";
  const icon = typeof body.icon === "string" && body.icon ? body.icon : "Target";
  const valorPadrao = Number(body.valorPadrao) || 0;

  const secondary = parseSecondaryIndicatorFields(body);
  if (secondary.touched && !secondary.ok) {
    return NextResponse.json({ error: secondary.error }, { status: 400 });
  }

  const indicator = await createReuniaoCustomIndicator({
    empresaId: empresa.id,
    meetingKey: "GERENTE",
    nome,
    icon,
    unidade,
    valorPadrao,
    nomeSecundario: secondary.touched && secondary.ok ? secondary.nomeSecundario : null,
    unidadeSecundaria: secondary.touched && secondary.ok ? secondary.unidadeSecundaria : null,
    createdById: session.user.id,
  });

  return NextResponse.json({ indicator });
}
