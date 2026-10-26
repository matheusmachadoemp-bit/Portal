import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { addMonths, setDate, lastDayOfMonth, getDate } from "date-fns";
import { parseDayInput } from "@/lib/timezone";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const MAX_INFINITE_MONTHS = 24; // gera 24 meses por vez para recorrências infinitas

// Define o vencimento no dia `dia` do mês de `base`, sem deixar o `setDate` do date-fns "rolar"
// pro mês seguinte quando esse dia não existir nesse mês (ex.: dia 31 em fevereiro). Sem isso,
// `setDate(05/02/2026, 31)` devolveria 03/03/2026 em vez de ficar dentro de fevereiro — usa o
// último dia do mês de `base` nesse caso.
function vencimentoNoDia(base: Date, dia: number): Date {
  const ultimoDiaDoMes = getDate(lastDayOfMonth(base));
  return setDate(base, Math.min(dia, ultimoDiaDoMes));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Financeiro." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const templates = await prisma.recurringTemplate.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    include: { categoria: true, bankAccount: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar lançamentos financeiros." },
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

  if (!body.descricao || !String(body.descricao).trim()) {
    return NextResponse.json({ error: "Descrição é obrigatória." }, { status: 400 });
  }
  const valorInput = Number(body.valor);
  if (!body.valor || !Number.isFinite(valorInput) || valorInput <= 0) {
    return NextResponse.json({ error: "Valor é obrigatório e deve ser maior que zero." }, { status: 400 });
  }

  // FinancialCategory é cadastro global (sem empresaId), então basta existir — não há "pertencer
  // à loja" para checar aqui. Mesmo padrão usado em `/api/financeiro/pagar`. Validado ANTES de
  // criar o template (campo obrigatório em `RecurringTemplate`, ver schema).
  if (!body.categoriaId) {
    return NextResponse.json({ error: "Categoria é obrigatória." }, { status: 400 });
  }
  const categoria = await prisma.financialCategory.findUnique({ where: { id: body.categoriaId } });
  if (!categoria) {
    return NextResponse.json({ error: "Categoria financeira não encontrada." }, { status: 400 });
  }

  const tipo: "PAGAR" | "RECEBER" = body.tipo;
  const valor = valorInput;
  const diaVencimento = Number(body.diaVencimento) || 1;
  // Meia-noite de São Paulo (03:00Z): addMonths/setDate abaixo preservam a hora, então toda competência e
  // vencimento gerado também nasce em 03:00Z (testado com o processo em UTC, America/Sao_Paulo e Asia/Tokyo).
  const dataInicio = parseDayInput(body.dataInicio);
  if (!dataInicio) {
    return NextResponse.json({ error: "Data de início inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }
  const meses = body.infinita ? MAX_INFINITE_MONTHS : Number(body.quantidadeMeses) || 1;

  const template = await prisma.recurringTemplate.create({
    data: {
      tipo,
      descricao: body.descricao,
      fornecedorCliente: body.fornecedorCliente || null,
      categoriaId: body.categoriaId,
      empresaId: empresa.id,
      centroCusto: body.centroCusto || null,
      valor,
      diaVencimento,
      bankAccountId: body.bankAccountId,
      formaPagamento: body.formaPagamento || "PIX",
      infinita: !!body.infinita,
      quantidadeMeses: body.infinita ? null : Number(body.quantidadeMeses) || 1,
      dataInicio,
      createdById: session.user.id,
    },
  });

  // Se o diaVencimento configurado já tiver passado dentro do mês de início (ex.: início dia 26,
  // vencimento dia 10), TODA a série de vencimentos é deslocada em 1 mês — decidido UMA única vez
  // aqui, a partir do dia real de `dataInicio` (nunca a partir do dia de uma competência já
  // "clampada" por um mês mais curto, como fevereiro; ver `vencimentoNoDia` acima), e aplicado
  // igual a cada parcela abaixo. Isso garante, para qualquer combinação de dataInicio/diaVencimento:
  // (1) nenhuma parcela vence antes de competir — se offsetMeses for 1, o vencimento cai sempre
  // num mês inteiro depois da própria competência, então qualquer dia dentro desse mês já é maior
  // que qualquer dia do mês da competência, mesmo com o clamping de `vencimentoNoDia`; se for 0, o
  // clamping (min) preserva a ordem entre diaVencimento e o dia de dataInicio, então vencimento
  // nunca fica atrás da competência; e (2) parcelas consecutivas nunca colidem no mesmo
  // vencimento, porque cada uma cai num mês civil seguinte ao da anterior, nunca no mesmo mês —
  // diferente de aplicar esse ajuste só na 1ª parcela (ou recalculado de forma independente em
  // cada parcela), que ou deixa o mesmo problema reaparecer a partir da 2ª parcela, ou pode fazer
  // duas parcelas vizinhas colidirem no mesmo dia.
  const offsetMeses = diaVencimento < getDate(dataInicio) ? 1 : 0;

  const entries = [];
  for (let i = 0; i < meses; i++) {
    const competencia = addMonths(dataInicio, i);
    const vencimento = vencimentoNoDia(addMonths(dataInicio, i + offsetMeses), diaVencimento);
    entries.push({
      descricao: body.descricao,
      categoriaId: body.categoriaId,
      empresaId: empresa.id,
      centroCusto: body.centroCusto || null,
      valor,
      dataCompetencia: competencia,
      dataVencimento: vencimento,
      bankAccountId: body.bankAccountId,
      recurringTemplateId: template.id,
      createdById: session.user.id,
    });
  }

  if (tipo === "PAGAR") {
    await prisma.payable.createMany({
      data: entries.map((e, i) => ({
        ...e,
        number: `CP-REC-${template.id.slice(-6)}-${i + 1}`,
        fornecedor: body.fornecedorCliente || body.descricao,
        formaPagamento: body.formaPagamento || "PIX",
        status: "EM_ABERTO",
      })),
    });
  } else {
    await prisma.receivable.createMany({
      data: entries.map((e, i) => ({
        ...e,
        number: `CR-REC-${template.id.slice(-6)}-${i + 1}`,
        cliente: body.fornecedorCliente || body.descricao,
        formaRecebimento: body.formaPagamento || "PIX",
        status: "EM_ABERTO",
      })),
    });
  }

  return NextResponse.json({ template, generated: entries.length });
}
