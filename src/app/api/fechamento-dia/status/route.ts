import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spDateKey } from "@/lib/checklist";
import { loadFechamentoSubmissoesDoDia } from "@/lib/fechamento-server";

/**
 * Status do dia: um card por cargo (Gerente/Chef de Salão/Chef de Cozinha,
 * por loja), com o status ENVIADO/PENDENTE/ATRASADO e o horário — a base da
 * tela "Status do Dia" (tela em si é fase futura, do Caio). Suporta o modo
 * "Grupo Nord" (várias lojas de uma vez), igual `GET /api/checklist/occurrences`.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Fechamento do Dia." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);
  const { searchParams } = new URL(req.url);
  const dateKey = searchParams.get("date") || spDateKey();

  const submissoes = await loadFechamentoSubmissoesDoDia(empresaIds, dateKey);
  const submissaoByCargoId = new Map(submissoes.map((s) => [s.cargoId, s]));

  const cargos = await prisma.fechamentoCargo.findMany({
    where: { empresaId: { in: empresaIds }, ativo: true },
    include: {
      empresa: { select: { id: true, name: true } },
      responsavel: { select: { id: true, name: true } },
      substituto: { select: { id: true, name: true } },
    },
    orderBy: [{ empresaId: "asc" }, { ordem: "asc" }],
  });

  const cards = await Promise.all(
    cargos.map(async (cargo) => {
      const [podeVisualizar, podeExecutar] = await Promise.all([
        hasModulePermission(session.user.id, "fechamento-dia", "canView", cargo.key),
        hasModulePermission(session.user.id, "fechamento-dia", "canExecute", cargo.key),
      ]);
      const submissao = submissaoByCargoId.get(cargo.id) ?? null;
      return {
        cargo: {
          id: cargo.id,
          key: cargo.key,
          nome: cargo.nome,
          icon: cargo.icon,
          ordem: cargo.ordem,
          empresa: cargo.empresa,
          responsavel: cargo.responsavel,
          substituto: cargo.substituto,
          horarioLiberacao: cargo.horarioLiberacao,
          horarioLimite: cargo.horarioLimite,
        },
        submissao: submissao && {
          id: submissao.id,
          status: submissao.status,
          releaseAt: submissao.releaseAt,
          dueAt: submissao.dueAt,
          enviadoEm: submissao.enviadoEm,
          notaGeral: submissao.notaGeral,
        },
        podeVisualizar,
        podeExecutar,
      };
    })
  );

  // Sem acesso nenhum a este cargo específico (nem ver nem preencher) não aparece no card —
  // evita expor status de cargos de outra área para quem não tem nenhuma permissão sobre eles.
  const visiveis = cards.filter((c) => c.podeVisualizar || c.podeExecutar);

  return NextResponse.json({ date: dateKey, cargos: visiveis });
}
