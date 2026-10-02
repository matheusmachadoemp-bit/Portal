import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const GATILHOS = ["EVENTO_PONTUAL", "AGREGADO_MENSAL"] as const;

/**
 * Edita uma regra existente (Administrador — mesma restrição de `POST /api/loja-nord/regras`).
 * `activityType` nunca é alterável por aqui, de propósito: é a chave estável que o código de
 * integração automática (Fase 3, ainda não implementada) vai usar pra casar o evento (tarefa
 * concluída, falta registrada etc.) com a regra. Se renomear fosse permitido depois que essa
 * automação existir, uma edição inocente na tela quebraria o crédito/débito em silêncio — por
 * isso o campo é simplesmente ignorado se vier no corpo da requisição.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR") {
    return NextResponse.json({ error: "Somente o Administrador pode editar regras de pontuação." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.lojaNordPointRule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  if (body.gatilho !== undefined && !GATILHOS.includes(body.gatilho)) {
    return NextResponse.json({ error: "Gatilho inválido." }, { status: 400 });
  }
  if (body.pontos !== undefined && !Number.isFinite(Number(body.pontos))) {
    return NextResponse.json({ error: "Quantidade de pontos inválida." }, { status: 400 });
  }
  if (body.label !== undefined && !String(body.label).trim()) {
    return NextResponse.json({ error: "O nome da regra não pode ficar vazio." }, { status: 400 });
  }

  const rule = await prisma.lojaNordPointRule.update({
    where: { id },
    data: {
      ...(body.label !== undefined ? { label: String(body.label).trim() } : {}),
      ...(body.pontos !== undefined ? { pontos: Math.round(Number(body.pontos)) } : {}),
      ...(body.gatilho !== undefined ? { gatilho: body.gatilho } : {}),
      ...(body.limiteDiario !== undefined
        ? {
            limiteDiario:
              body.limiteDiario === null || body.limiteDiario === "" ? null : Math.max(1, Math.round(Number(body.limiteDiario))),
          }
        : {}),
      ...(body.limiteMensal !== undefined
        ? {
            limiteMensal:
              body.limiteMensal === null || body.limiteMensal === "" ? null : Math.max(1, Math.round(Number(body.limiteMensal))),
          }
        : {}),
      ...(body.exigeValidacao !== undefined ? { exigeValidacao: !!body.exigeValidacao } : {}),
      ...(body.setores !== undefined ? { setores: Array.isArray(body.setores) ? body.setores : [] } : {}),
      ...(body.empresaIds !== undefined ? { empresaIds: Array.isArray(body.empresaIds) ? body.empresaIds : [] } : {}),
      ...(body.validoDe !== undefined ? { validoDe: body.validoDe ? new Date(body.validoDe) : null } : {}),
      ...(body.validoAte !== undefined ? { validoAte: body.validoAte ? new Date(body.validoAte) : null } : {}),
      ...(body.active !== undefined ? { active: !!body.active } : {}),
    },
  });

  return NextResponse.json({ rule });
}

/**
 * "Exclui" uma regra — na prática desativa (`active = false`), nunca um DELETE físico. Mesmo
 * racional de `LojaNordReward` (que nem expõe esse verbo, só `PATCH {active:false}`): uma regra
 * pode já ter gerado `LojaNordPointTransaction` no passado (`ruleId`), e remover a linha de
 * verdade preservaria a transação (a FK é `ON DELETE SET NULL`) mas perderia pra sempre de qual
 * regra ela veio — ruim pra um histórico financeiro-adjacente como este.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR") {
    return NextResponse.json({ error: "Somente o Administrador pode excluir regras de pontuação." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.lojaNordPointRule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });

  const rule = await prisma.lojaNordPointRule.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ rule });
}
