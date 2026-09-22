import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeHorasTrabalhadas } from "@/lib/rh-helpers";
import { hasModulePermission } from "@/lib/authz";

// BUG-004b: mesma checagem de cargo já usada nas rotas irmãs `/api/rh/employees` e
// `/api/rh/finance` (desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (rh:canView=true de fábrica) conseguia chamar este GET direto
// (fora da tela, que já foi corrigida no BUG-004) e listar os registros de ponto de todos os
// colegas.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

/** Inteiro >= 1 (opcionalmente limitado a `max`) a partir de um parâmetro de query; `null`/vazio/inválido/não-inteiro/<1 caem no `fallback`. */
function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return max !== undefined ? Math.min(n, max) : n;
}

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
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where = {
    empresaId: { in: empresaIdsForContext(ctx) },
    ...(employeeId ? { employeeId } : {}),
    ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
  };

  // Paginação opt-in — mesmo padrão de src/app/api/tarefas/route.ts (ver comentário lá): só ativa
  // quando a chamada manda `page` e/ou `pageSize` na query string (1-indexado; `pageSize` de 1 a
  // 200, padrão 50). Sem esses parâmetros, a rota mantém o formato de resposta de sempre (`{
  // entries }`, sem `pagination`) — hoje o único consumidor
  // (src/app/portal/rh/ponto-eletronico/ponto-eletronico-client.tsx, função `refresh()`) busca
  // sempre a lista inteira (sem `from`/`to`) e filtra/agrega no cliente por cima dela (período
  // selecionado na tela + gráfico de tendência mensal), então mudar o formato por padrão quebraria
  // essa tela.
  //
  // Diferente de Tarefas, aqui NÃO removemos o teto de segurança no caminho sem paginação: RH gera
  // ~1 registro de ponto por colaborador por dia (crescimento constante e sem fim, ao contrário de
  // Tarefas, que tende a estabilizar por status/prazo), e o `where` acima pode abranger várias lojas
  // de uma vez no modo Grupo Nord consolidado — uma busca 100% sem `take` arriscaria uma consulta
  // muito grande conforme o histórico cresce. Em vez de manter os 500 fixos (que já se mostraram
  // insuficientes — ~500 dias-colaborador somem da tela sem aviso, um problema real mesmo para uma
  // loja pequena), subimos o teto pra 2000 como um remendo temporário: reduz bastante a chance de
  // estourar no uso atual sem tornar a consulta irrestrita. Isso não resolve o problema de raiz (uma
  // loja com histórico grande o suficiente ainda vai perder registros silenciosamente além do teto)
  // — a correção completa depende da tela adotar a paginação (ou algum filtro de período padrão),
  // que já está pronta e disponível via `?page=`/`?pageSize=` mas ainda não foi ligada na UI.
  const SAFETY_TAKE = 2000;

  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("pageSize");
  const paginar = pageParam !== null || pageSizeParam !== null;
  const page = parsePositiveInt(pageParam, 1);
  const pageSize = parsePositiveInt(pageSizeParam, 50, 200);

  const [entries, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      orderBy: { date: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
      skip: paginar ? (page - 1) * pageSize : undefined,
      take: paginar ? pageSize : SAFETY_TAKE,
    }),
    paginar ? prisma.timeEntry.count({ where }) : null,
  ]);

  if (!paginar) return NextResponse.json({ entries });

  const totalCount = total ?? 0;
  return NextResponse.json({
    entries,
    pagination: { page, pageSize, total: totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  // O upsert abaixo (create/update por employeeId+date) é só uma proteção contra duplicidade —
  // no fluxo da tela (ponto-eletronico-client.tsx) este POST só é chamado para lançar um registro
  // novo; editar um já existente vai sempre pela rota PATCH em [id]. Por isso trata como canCreate.
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar registros de ponto." },
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
  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
  }

  const horasTrabalhadas = computeHorasTrabalhadas({
    entrada: body.entrada,
    saidaAlmoco: body.saidaAlmoco,
    retornoAlmoco: body.retornoAlmoco,
    saida: body.saida,
  });

  const entry = await prisma.timeEntry.upsert({
    where: { employeeId_date: { employeeId: body.employeeId, date: new Date(body.date) } },
    create: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      date: new Date(body.date),
      entrada: body.entrada || null,
      saidaAlmoco: body.saidaAlmoco || null,
      retornoAlmoco: body.retornoAlmoco || null,
      saida: body.saida || null,
      horasTrabalhadas,
      atrasoMinutos: Number(body.atrasoMinutos) || 0,
      falta: !!body.falta,
    },
    update: {
      entrada: body.entrada || null,
      saidaAlmoco: body.saidaAlmoco || null,
      retornoAlmoco: body.retornoAlmoco || null,
      saida: body.saida || null,
      horasTrabalhadas,
      atrasoMinutos: Number(body.atrasoMinutos) || 0,
      falta: !!body.falta,
    },
  });

  return NextResponse.json({ entry });
}
