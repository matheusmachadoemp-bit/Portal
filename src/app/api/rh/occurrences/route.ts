import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { computeOccurrenceCounts, computeOccurrenceRanking, type OccurrenceRanking } from "@/lib/rh-server";

// BUG-004b: mesma checagem de cargo já usada nas rotas irmãs `/api/rh/employees` e
// `/api/rh/finance` (desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (rh:canView=true de fábrica) conseguia chamar este GET direto
// (fora da tela, que já foi corrigida no BUG-004) e listar as ocorrências disciplinares de todos
// os colegas.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

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
  const employeeId = searchParams.get("employeeId");

  // Task #309: o `take` fixo de 300 já existia antes desta task, mas era aplicado igual nos dois
  // casos de uso da rota — filtrado por employeeId (refresh() da ficha do colaborador, que espera
  // exatamente 300 pra bater com OCCURRENCES_SAFETY_TAKE em colaboradores/[id]/page.tsx) e sem
  // filtro (refresh() da página standalone .../rh/ocorrencias/page.tsx, que soma as ocorrências de
  // TODOS os colaboradores da loja/Grupo Nord). Isso cortava o caso sem filtro no mesmo teto
  // pensado pra 1 colaborador só. Teto sem filtro sobe pra 1000 (mesma conta de colaboradores/loja
  // documentada em .../rh/ocorrencias/page.tsx); o individual continua 300, inalterado, pra não
  // mudar o comportamento já validado da ficha no #287.
  const OCCURRENCES_INDIVIDUAL_TAKE = 300;
  const OCCURRENCES_STORE_TAKE = 1000;

  const where = {
    employee: { empresaId: { in: empresaIdsForContext(ctx) } },
    ...(employeeId ? { employeeId } : {}),
  };

  // Task #309 revisão (Teulis): `counts` (StatCards "Faltas"/"Atrasos"/etc.) sempre via agregação
  // no banco (sem `take`), nunca contando a lista `occurrences` abaixo (que tem `take`) — ver
  // racional completo em src/lib/rh-server.ts. `ranking` (top 5 por atraso/falta) só faz sentido
  // sem filtro de colaborador (a tela esconde essas seções quando `employeeId` vem preenchido, e
  // ranquear 1 pessoa só não faz sentido) — pulamos as 2 queries extras nesse caso.
  const [occurrences, counts, ranking] = await Promise.all([
    prisma.occurrence.findMany({
      where,
      orderBy: { date: "desc" },
      take: employeeId ? OCCURRENCES_INDIVIDUAL_TAKE : OCCURRENCES_STORE_TAKE,
      include: { employee: { select: { name: true, setor: true } }, createdBy: { select: { name: true } } },
    }),
    computeOccurrenceCounts(where),
    employeeId ? Promise.resolve<OccurrenceRanking>({ atrasos: [], faltas: [] }) : computeOccurrenceRanking(where),
  ]);
  return NextResponse.json({ occurrences, counts, ranking });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite registrar ocorrências." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  if (body.anexoUrl && !isValidBlobUrl(body.anexoUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
  }

  const occurrence = await prisma.occurrence.create({
    data: {
      employeeId: body.employeeId,
      date: new Date(body.date),
      type: body.type,
      horarioPrevisto: body.horarioPrevisto || null,
      horarioRealizado: body.horarioRealizado || null,
      minutosAtraso: Number(body.minutosAtraso) || 0,
      justificativa: body.justificativa || null,
      medidasTomadas: body.medidasTomadas || null,
      prazo: body.prazo ? new Date(body.prazo) : null,
      anexoUrl: body.anexoUrl || null,
      observacao: body.observacao || null,
      status: body.status || "PENDENTE",
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ occurrence });
}
