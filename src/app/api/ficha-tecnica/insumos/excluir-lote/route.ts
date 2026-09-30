import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { excluirIngredientSeNaoEmUso } from "@/lib/ficha-tecnica-server";

const MAX_IDS_POR_LOTE = 500;

type ResultadoItem = {
  id: string;
  nome: string | null;
  excluido: boolean;
  motivo?: string;
};

/**
 * Exclusão em lote de insumos (Estoque > Produtos / aba "Insumos" da Ficha Técnica). Recebe
 * `{ ids: string[] }` no corpo e devolve um resultado POR ITEM — quais foram excluídos com
 * sucesso e quais foram bloqueados (com nome e motivo de cada um). Nunca "tudo ou nada": um id
 * bloqueado (em uso) não impede os demais ids do mesmo lote de serem excluídos, e um id inválido
 * (não encontrado ou de outra loja) não aborta o lote inteiro — só aquele item do resultado
 * reporta o problema.
 *
 * Reaproveita a MESMA regra de bloqueio do `DELETE /api/ficha-tecnica/insumos/[id]` via
 * `excluirIngredientSeNaoEmUso` (`src/lib/ficha-tecnica-server.ts`) — a lista de relacionamentos
 * que tornam um insumo "em uso" não é duplicada aqui.
 *
 * A permissão (`canDelete` do módulo "ficha-tecnica") é checada uma única vez pro lote inteiro —
 * diferente do acesso à loja (`assertEmpresaAccess`), que é por item, já que um lote pode conter
 * ids de mais de uma empresa (ex.: modo Grupo Nord consolidado).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir insumos." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const rawIds = body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0 || !rawIds.every((v) => typeof v === "string" && v.trim())) {
    return NextResponse.json({ error: "Informe ao menos um id de insumo em 'ids'." }, { status: 400 });
  }

  const ids = Array.from(new Set(rawIds as string[]));
  if (ids.length > MAX_IDS_POR_LOTE) {
    return NextResponse.json(
      { error: `Selecione no máximo ${MAX_IDS_POR_LOTE} insumos por vez.` },
      { status: 400 }
    );
  }

  // Processados em sequência (não em paralelo, não numa transação única): cada exclusão precisa
  // ser um resultado independente dos demais — uma transação única faria um bloqueio abortar (ou
  // um erro inesperado dar rollack) o lote inteiro, contrariando o "nunca tudo ou nada" pedido.
  const resultados: ResultadoItem[] = [];
  for (const id of ids) {
    const existing = await prisma.ingredient.findUnique({
      where: { id },
      select: { id: true, name: true, empresaId: true },
    });
    if (!existing) {
      resultados.push({ id, nome: null, excluido: false, motivo: "Insumo não encontrado." });
      continue;
    }
    if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
      // `nome: null` de propósito (mesmo padrão do branch "não encontrado" acima): o usuário não
      // tem acesso a essa loja, então a resposta não pode vazar o nome real do insumo dela — a
      // rota individual (`DELETE /api/ficha-tecnica/insumos/[id]`) já se comporta assim no mesmo
      // cenário, só devolvendo "Sem acesso a essa loja." sem identificar o registro.
      resultados.push({ id, nome: null, excluido: false, motivo: "Sem acesso a essa loja." });
      continue;
    }

    const resultado = await excluirIngredientSeNaoEmUso(id, existing.name);
    if (resultado.deletado) {
      resultados.push({ id, nome: existing.name, excluido: true });
    } else {
      resultados.push({ id, nome: existing.name, excluido: false, motivo: resultado.motivo });
    }
  }

  const totalExcluidos = resultados.filter((r) => r.excluido).length;
  const totalBloqueados = resultados.length - totalExcluidos;

  return NextResponse.json({ resultados, totalExcluidos, totalBloqueados });
}
