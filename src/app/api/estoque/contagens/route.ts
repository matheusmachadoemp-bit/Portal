import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { buildStockCountItemsData } from "@/lib/estoque-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const counts = await prisma.stockCount.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) }, ...(type ? { type: type as never } : {}) },
    orderBy: { dataContagem: "desc" },
    take: 100,
    include: {
      empresa: { select: { id: true, name: true, color: true } },
      items: { select: { quantidadeContada: true, status: true } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ counts });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite iniciar contagens de estoque." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para iniciar uma contagem." }, { status: 400 });
  }

  const body = await req.json();
  const type = body.type === "MENSAL" ? "MENSAL" : "SEMANAL";
  const now = new Date();
  const setor = body.setor || null;

  // Seleção manual de itens (opcional): quando a tela envia `ingredientIds`, a contagem só leva
  // esses itens (ainda restritos a empresa/setor/ativos, nunca confiando cegamente no id vindo
  // do corpo da requisição — ver `buildStockCountItemsData`). Quando não vem, mantém o
  // comportamento de sempre: todos os ingredientes ativos do setor informado (ou da empresa
  // inteira, se nenhum setor for informado).
  const ingredientIds = Array.isArray(body.ingredientIds)
    ? body.ingredientIds.filter((id: unknown): id is string => typeof id === "string")
    : undefined;

  // Prazo (opcional): mesmo padrão de `ProductionOrder.prazo` — validado aqui (400 claro em vez
  // de deixar o Prisma rejeitar uma Data inválida mais tarde) igual `isValidHorario` já faz pro
  // horário da agenda em /api/estoque/contagens/agenda.
  let prazo: Date | null = null;
  if (body.prazo !== undefined && body.prazo !== null && body.prazo !== "") {
    const parsed = new Date(body.prazo);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Prazo inválido." }, { status: 400 });
    }
    prazo = parsed;
  }

  const itemsData = await buildStockCountItemsData(empresa.id, setor, ingredientIds);

  const count = await prisma.stockCount.create({
    data: {
      empresaId: empresa.id,
      type,
      setor,
      semana: body.semana ? Number(body.semana) : null,
      mes: type === "MENSAL" ? now.getMonth() + 1 : null,
      ano: body.ano ? Number(body.ano) : now.getFullYear(),
      responsavel: body.responsavel || session.user.name || null,
      horaInicio: body.horaInicio || now.toTimeString().slice(0, 5),
      status: "EM_ANDAMENTO",
      checklistJson: type === "MENSAL" ? JSON.stringify({}) : null,
      prazo,
      createdById: session.user.id,
      items: { create: itemsData },
    },
    include: { items: { include: { ingredient: true } } },
  });

  return NextResponse.json({ count });
}
