import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Edita um brinde do catálogo, incluindo ativar/desativar (Administrador/Gestor). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para editar brindes." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const existing = await prisma.lojaNordReward.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Brinde não encontrado." }, { status: 404 });

  const reward = await prisma.lojaNordReward.update({
    where: { id },
    data: {
      ...(body.nome !== undefined ? { nome: body.nome } : {}),
      ...(body.descricao !== undefined ? { descricao: body.descricao || null } : {}),
      ...(body.categoria !== undefined ? { categoria: body.categoria } : {}),
      ...(body.imagemUrl !== undefined ? { imagemUrl: body.imagemUrl || null } : {}),
      ...(body.pontos !== undefined ? { pontos: Math.max(0, Math.round(body.pontos)) } : {}),
      ...(body.estoque !== undefined
        ? { estoque: body.estoque === null || body.estoque === "" ? null : Math.max(0, Math.round(body.estoque)) }
        : {}),
      ...(body.estoqueMinimo !== undefined
        ? { estoqueMinimo: body.estoqueMinimo === null || body.estoqueMinimo === "" ? null : Math.max(0, Math.round(body.estoqueMinimo)) }
        : {}),
      ...(body.limitePorColaborador !== undefined
        ? {
            limitePorColaborador:
              body.limitePorColaborador === null || body.limitePorColaborador === "" ? null : Math.max(1, Math.round(body.limitePorColaborador)),
          }
        : {}),
      ...(body.disponivelDe !== undefined ? { disponivelDe: body.disponivelDe ? new Date(body.disponivelDe) : null } : {}),
      ...(body.disponivelAte !== undefined ? { disponivelAte: body.disponivelAte ? new Date(body.disponivelAte) : null } : {}),
      ...(body.empresaIds !== undefined ? { empresaIds: Array.isArray(body.empresaIds) ? body.empresaIds : [] } : {}),
      ...(body.exigeAprovacao !== undefined ? { exigeAprovacao: !!body.exigeAprovacao } : {}),
      ...(body.regras !== undefined ? { regras: body.regras || null } : {}),
      ...(body.active !== undefined ? { active: !!body.active } : {}),
    },
  });

  return NextResponse.json({ reward });
}
