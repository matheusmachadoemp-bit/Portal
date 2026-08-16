import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { ingredientCostPerUnit } from "@/lib/estoque";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } }, empresa: true },
  });
  if (!count) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  return NextResponse.json({ count });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.stockCount.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } }, empresa: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });

  // --- Atualização item a item (contagem em andamento) ---
  if (Array.isArray(body.items)) {
    const limiar = existing.empresa.metaDivergenciaContagemPercent;
    for (const upd of body.items as { itemId: string; quantidadeContada?: number; observacao?: string; fotoUrl?: string; justificativa?: string; status?: string }[]) {
      const item = existing.items.find((i) => i.id === upd.itemId);
      if (!item) continue;
      const custoUnit = ingredientCostPerUnit(item.ingredient);
      const contada = upd.quantidadeContada;
      let diferencaQtd: number | null = null;
      let diferencaPercent: number | null = null;
      let diferencaReais: number | null = null;
      let status = upd.status ?? "PENDENTE";
      if (contada !== undefined && contada !== null) {
        diferencaQtd = contada - item.estoqueEsperado;
        diferencaPercent = item.estoqueEsperado ? (diferencaQtd / item.estoqueEsperado) * 100 : contada > 0 ? 100 : 0;
        diferencaReais = diferencaQtd * custoUnit;
        status = Math.abs(diferencaPercent) > limiar ? "DIVERGENCIA" : "CONTADO";
      }
      await prisma.stockCountItem.update({
        where: { id: upd.itemId },
        data: {
          quantidadeContada: contada ?? undefined,
          diferencaQtd: diferencaQtd ?? undefined,
          diferencaPercent: diferencaPercent ?? undefined,
          diferencaReais: diferencaReais ?? undefined,
          observacao: upd.observacao !== undefined ? upd.observacao || null : undefined,
          fotoUrl: upd.fotoUrl !== undefined ? upd.fotoUrl || null : undefined,
          justificativa: upd.justificativa !== undefined ? upd.justificativa || null : undefined,
          status: status as never,
        },
      });
    }
  }

  // --- Transições de status da contagem ---
  const novoStatus = body.status as string | undefined;
  const data: Record<string, unknown> = {
    horaFim: novoStatus === "CONCLUIDA" ? new Date().toTimeString().slice(0, 5) : undefined,
    checklistJson: body.checklistJson !== undefined ? JSON.stringify(body.checklistJson) : undefined,
  };

  if (novoStatus === "CONCLUIDA" || novoStatus === "EM_ANDAMENTO") {
    data.status = novoStatus;
  }

  if (novoStatus === "APROVADA") {
    if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR" && session.user.role !== "GERENTE") {
      return NextResponse.json({ error: "Apenas gerentes, gestores ou administradores podem aprovar o fechamento." }, { status: 403 });
    }
    data.status = "APROVADA";
    data.aprovadoPor = body.aprovadoPor || session.user.name;
    data.aprovadoEm = new Date();

    const fresh = await prisma.stockCountItem.findMany({ where: { countId: id }, include: { ingredient: true } });
    const ops = fresh
      .filter((i) => i.quantidadeContada !== null && i.quantidadeContada !== undefined)
      .flatMap((i) => [
        prisma.ingredient.update({ where: { id: i.ingredientId }, data: { estoqueAtual: i.quantidadeContada! } }),
        prisma.stockMovement.create({
          data: {
            ingredientId: i.ingredientId,
            empresaId: existing.empresaId,
            type: "INVENTARIO",
            quantidade: i.quantidadeContada!,
            estoqueApos: i.quantidadeContada!,
            motivo: `Contagem ${existing.type === "MENSAL" ? "mensal" : "semanal"} aprovada`,
            origin: "CONTAGEM",
            autorizadoPor: data.aprovadoPor as string,
            createdById: session.user.id,
          },
        }),
        prisma.stockCountItem.update({ where: { id: i.id }, data: { status: "APROVADO" } }),
      ]);
    if (ops.length) await prisma.$transaction(ops);
  }

  if (novoStatus === "REABERTA") {
    if (session.user.role !== "ADMINISTRADOR") {
      return NextResponse.json({ error: "Apenas o administrador pode reabrir um fechamento." }, { status: 403 });
    }
    if (!body.motivoReabertura) {
      return NextResponse.json({ error: "Informe o motivo da reabertura." }, { status: 400 });
    }
    data.status = "REABERTA";
    data.motivoReabertura = body.motivoReabertura;
  }

  const count = await prisma.stockCount.update({
    where: { id },
    data,
    include: { items: { include: { ingredient: true } } },
  });

  return NextResponse.json({ count });
}
