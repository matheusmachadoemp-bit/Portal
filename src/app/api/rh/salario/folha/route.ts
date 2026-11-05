import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { competenciaRange } from "@/lib/adicional-noturno";

// Mesmo corte de cargo já usado pelas rotas irmãs de RH (`/api/rh/vacations`, `/api/rh/finance`,
// `/api/rh/employees`) pra VER a lista — ver `src/app/api/rh/salario/folha/[id]/route.ts` para o
// corte mais restrito usado pra APROVAR/REPROVAR uma linha (decisão financeira, não operacional).
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

/** Inteiro dentro de [min, max] a partir de um parâmetro de query; `null` se ausente/inválido. */
function parseIntInRange(value: string | null, min: number, max: number): number | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * Folha Salarial de uma competência (RH > Financeiro > Salário — tela ainda não construída,
 * nasce numa tarefa própria do Caio depois desta). Lê os `NightShiftAllowance` já calculados
 * (automático todo dia 2, ver `/api/cron/rh/adicional-noturno`) — não calcula nada na hora; um
 * colaborador sem nenhuma hora noturna no mês simplesmente não gera linha (ver
 * `src/lib/adicional-noturno.ts`), então não aparece aqui.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o RH." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const competenciaMes = parseIntInRange(searchParams.get("mes"), 1, 12) ?? now.getMonth() + 1;
  const competenciaAno = parseIntInRange(searchParams.get("ano"), 2000, 2100) ?? now.getFullYear();

  const empresaIds = empresaIdsForContext(ctx);

  const allowances = await prisma.nightShiftAllowance.findMany({
    where: { empresaId: { in: empresaIds }, competenciaMes, competenciaAno },
    include: {
      employee: { select: { name: true, cargo: true, salarioFixo: true } },
      aprovadoPor: { select: { name: true } },
    },
    orderBy: { employee: { name: "asc" } },
  });

  if (allowances.length === 0) {
    return NextResponse.json({ competenciaMes, competenciaAno, linhas: [] });
  }

  // Descontos = soma de EmployeeFinanceEntry tipo DESCONTO de cada colaborador na mesma
  // competência (decisão já tomada com o usuário, ver CLAUDE.md da tarefa) — uma única query
  // agregada pra todos os colaboradores da lista, em vez de 1 query por linha.
  const { from, to } = competenciaRange(competenciaMes, competenciaAno);
  const descontosPorColaborador = await prisma.employeeFinanceEntry.groupBy({
    by: ["employeeId"],
    where: {
      employeeId: { in: allowances.map((a) => a.employeeId) },
      type: "DESCONTO",
      date: { gte: from, lt: to },
    },
    _sum: { value: true },
  });
  const descontosMap = new Map(descontosPorColaborador.map((d) => [d.employeeId, d._sum.value ?? 0]));

  const linhas = allowances.map((a) => {
    const descontos = descontosMap.get(a.employeeId) ?? 0;
    const salarioBruto = (a.employee.salarioFixo ?? 0) + a.valorAdicional;
    const salarioLiquido = salarioBruto - descontos;
    return {
      id: a.id,
      employeeId: a.employeeId,
      nome: a.employee.name,
      cargo: a.employee.cargo,
      horasNoturnasReais: a.horasNoturnasReais,
      horasNoturnasConvertidas: a.horasNoturnasConvertidas,
      salarioBruto,
      adicionalNoturno: a.valorAdicional,
      descontos,
      salarioLiquido,
      status: a.status,
      aprovadoPorNome: a.aprovadoPor?.name ?? null,
      aprovadoEm: a.aprovadoEm,
    };
  });

  return NextResponse.json({ competenciaMes, competenciaAno, linhas });
}
