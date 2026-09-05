import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { generateEquipamentoCodigo, MANAGER_ROLES } from "@/lib/manutencao-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const setor = searchParams.get("setor");
  const categoria = searchParams.get("categoria");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { empresaId: { in: empresaIds } };
  if (setor) where.setor = setor;
  if (categoria) where.categoria = categoria;
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { codigo: { contains: q, mode: "insensitive" } },
      { marca: { contains: q, mode: "insensitive" } },
      { modelo: { contains: q, mode: "insensitive" } },
      { numeroSerie: { contains: q, mode: "insensitive" } },
    ];
  }

  const equipamentos = await prisma.equipamento.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      empresa: { select: { id: true, name: true, color: true } },
      _count: { select: { chamados: true } },
    },
  });

  return NextResponse.json({ equipamentos });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode cadastrar equipamentos." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.nome || !body.setor || !body.categoria) {
    return NextResponse.json({ error: "Nome, setor e categoria são obrigatórios." }, { status: 400 });
  }

  const equipamento = await prisma.$transaction(async (tx) => {
    const created = await tx.equipamento.create({
      data: {
        codigo: `TEMP-${Date.now()}`,
        empresaId: empresa.id,
        nome: body.nome,
        fotoUrl: body.fotoUrl || null,
        setor: body.setor,
        localizacao: body.localizacao || null,
        categoria: body.categoria,
        marca: body.marca || null,
        modelo: body.modelo || null,
        numeroSerie: body.numeroSerie || null,
        dataCompra: body.dataCompra ? new Date(body.dataCompra) : null,
        valorCompra: body.valorCompra ? Number(body.valorCompra) : null,
        fornecedor: body.fornecedor || null,
        numeroNotaFiscal: body.numeroNotaFiscal || null,
        garantiaAte: body.garantiaAte ? new Date(body.garantiaAte) : null,
        vidaUtilEstimadaMeses: body.vidaUtilEstimadaMeses ? Number(body.vidaUtilEstimadaMeses) : null,
        frequenciaManutencao: body.frequenciaManutencao || "NENHUMA",
        prestadorRecomendado: body.prestadorRecomendado || null,
        observacoes: body.observacoes || null,
        status: body.status || "FUNCIONANDO",
        createdById: session.user.id,
      },
    });
    await generateEquipamentoCodigo(tx, created.id, created.sequence, empresa.key, body.setor, body.nome);
    if (Array.isArray(body.anexos) && body.anexos.length > 0) {
      await tx.manutencaoAnexo.createMany({
        data: body.anexos.map((a: { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number; tipo?: string }) => ({
          equipamentoId: created.id,
          name: a.name,
          fileUrl: a.fileUrl,
          mimeType: a.mimeType || null,
          sizeBytes: a.sizeBytes || null,
          tipo: a.tipo || "DOCUMENTO",
          uploadedById: session.user.id,
        })),
      });
    }
    return tx.equipamento.findUniqueOrThrow({ where: { id: created.id } });
  });

  return NextResponse.json({ equipamento });
}
