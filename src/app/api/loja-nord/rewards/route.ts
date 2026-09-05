import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveEmpresaContext } from "@/lib/empresa";

/** Catálogo de brindes disponíveis para a loja ativa do usuário logado. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaId = ctx.mode === "single" ? ctx.empresa.id : null;

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search")?.trim() ?? "";
  const categoria = searchParams.get("categoria");
  const disponibilidade = searchParams.get("disponibilidade");
  const sort = searchParams.get("sort");

  const now = new Date();
  const rewards = await prisma.lojaNordReward.findMany({
    where: {
      active: true,
      ...(categoria && categoria !== "TODOS" ? { categoria: categoria as never } : {}),
      ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
      OR: [{ disponivelDe: null }, { disponivelDe: { lte: now } }],
    },
    orderBy: sort === "maior_pontos" ? { pontos: "desc" } : sort === "menor_pontos" ? { pontos: "asc" } : { createdAt: "desc" },
  });

  const visiveis = rewards.filter((r) => {
    if (r.disponivelAte && r.disponivelAte < now) return false;
    if (empresaId && r.empresaIds.length > 0 && !r.empresaIds.includes(empresaId)) return false;
    if (disponibilidade === "disponivel" && r.estoque !== null && r.estoque <= 0) return false;
    return true;
  });

  return NextResponse.json({ rewards: visiveis });
}

/** Cadastra um novo brinde no catálogo (Administrador/Gestor). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para cadastrar brindes." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.nome || !body?.categoria || !Number.isFinite(body?.pontos)) {
    return NextResponse.json({ error: "Preencha nome, categoria e quantidade de pontos." }, { status: 400 });
  }

  const reward = await prisma.lojaNordReward.create({
    data: {
      nome: body.nome,
      descricao: body.descricao || null,
      categoria: body.categoria,
      imagemUrl: body.imagemUrl || null,
      pontos: Math.max(0, Math.round(body.pontos)),
      estoque: body.estoque === null || body.estoque === "" || body.estoque === undefined ? null : Math.max(0, Math.round(body.estoque)),
      estoqueMinimo:
        body.estoqueMinimo === null || body.estoqueMinimo === "" || body.estoqueMinimo === undefined
          ? null
          : Math.max(0, Math.round(body.estoqueMinimo)),
      limitePorColaborador:
        body.limitePorColaborador === null || body.limitePorColaborador === "" || body.limitePorColaborador === undefined
          ? null
          : Math.max(1, Math.round(body.limitePorColaborador)),
      disponivelDe: body.disponivelDe ? new Date(body.disponivelDe) : null,
      disponivelAte: body.disponivelAte ? new Date(body.disponivelAte) : null,
      empresaIds: Array.isArray(body.empresaIds) ? body.empresaIds : [],
      exigeAprovacao: body.exigeAprovacao !== false,
      regras: body.regras || null,
      active: body.active !== false,
    },
  });

  return NextResponse.json({ reward });
}
