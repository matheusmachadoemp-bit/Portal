import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const UNIDADES = ["PERCENT", "CURRENCY", "NUMBER"] as const;
const DIRECOES = ["MIN", "MAX"] as const;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar metas na Reunião Gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const nome = String(body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe um nome para a meta." }, { status: 400 });

  const unidade = UNIDADES.includes(body.unidade) ? body.unidade : "PERCENT";
  const direcao = DIRECOES.includes(body.direcao) ? body.direcao : "MIN";
  const icon = typeof body.icon === "string" && body.icon ? body.icon : "Target";
  const metaPadrao = Number(body.metaPadrao) || 0;
  const premiacaoPadrao = Number(body.premiacaoPadrao) || 0;

  const maxOrder = await prisma.gerenteCustomIndicator.aggregate({
    where: { empresaId: empresa.id },
    _max: { order: true },
  });

  const indicator = await prisma.gerenteCustomIndicator.create({
    data: {
      empresaId: empresa.id,
      nome,
      icon,
      unidade,
      direcao,
      metaPadrao,
      premiacaoPadrao,
      order: (maxOrder._max.order ?? 0) + 1,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ indicator });
}
