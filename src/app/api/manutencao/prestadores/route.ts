import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, getUserEmpresas } from "@/lib/empresa";
import { MANAGER_ROLES } from "@/lib/manutencao-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const onlyActive = searchParams.get("active");

  const where: Record<string, unknown> = {
    OR: [{ empresaIds: { isEmpty: true } }, { empresaIds: { hasSome: empresaIds } }],
  };
  if (onlyActive === "true") where.active = true;
  if (q) {
    where.AND = [
      {
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { especialidade: { contains: q, mode: "insensitive" } },
          { documento: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  const prestadores = await prisma.prestador.findMany({
    where,
    orderBy: { nome: "asc" },
    include: {
      _count: { select: { orcamentos: true, registros: true } },
    },
  });

  const valores = await prisma.manutencaoRegistro.groupBy({
    by: ["prestadorId"],
    where: { prestadorId: { in: prestadores.map((p) => p.id) } },
    _sum: { valorTotal: true },
  });
  const valorPorPrestador = new Map(valores.map((v) => [v.prestadorId, v._sum.valorTotal ?? 0]));

  return NextResponse.json({
    prestadores: prestadores.map((p) => ({ ...p, valorTotalGasto: valorPorPrestador.get(p.id) ?? 0 })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode cadastrar prestadores." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.nome || !body.nome.trim()) {
    return NextResponse.json({ error: "Nome ou razão social é obrigatório." }, { status: 400 });
  }

  const empresaIds: string[] = Array.isArray(body.empresaIds) ? body.empresaIds : [];
  if (empresaIds.length > 0) {
    const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
    const idsPermitidos = new Set(empresasPermitidas.map((e) => e.id));
    if (empresaIds.some((id) => !idsPermitidos.has(id))) {
      return NextResponse.json({ error: "Loja inválida ou sem acesso." }, { status: 400 });
    }
  }

  const prestador = await prisma.prestador.create({
    data: {
      nome: body.nome,
      nomeContato: body.nomeContato || null,
      especialidade: body.especialidade || null,
      telefone: body.telefone || null,
      whatsapp: body.whatsapp || null,
      email: body.email || null,
      documento: body.documento || null,
      endereco: body.endereco || null,
      empresaIds,
      avaliacao: body.avaliacao ? Number(body.avaliacao) : null,
      observacoes: body.observacoes || null,
      active: body.active !== undefined ? !!body.active : true,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ prestador });
}
