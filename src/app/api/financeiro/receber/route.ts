import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { addMonths } from "date-fns";
import { parseDayInput } from "@/lib/timezone";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { balanceDelta, RECEIVABLE_PAYMENT_METHODS, splitInstallments } from "@/lib/finance";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// Teto de segurança (mesmo espírito de `take: 300/2000` em `/api/estoque/compras` e `MAX_ROWS` em
// `/api/financeiro/conciliacao`): sem isso, qualquer chamada deste GET sem filtro de data devolvia
// o histórico inteiro da loja desde sempre — e era exatamente isso que `refresh()` em
// `contas-receber-client.tsx` fazia depois de QUALQUER ação (criar/editar/receber/excluir), trocando
// silenciosamente a janela de "últimos 120 dias" do carregamento inicial (ver
// `contas-a-receber/page.tsx`) por "tudo". A correção de raiz é `refresh()` reenviar a mesma janela
// de 120 dias (`from`, sem `to` — os mesmos limites do carregamento inicial, que só tem piso e não
// teto, para não esconder vencimentos futuros); os tetos abaixo são só uma rede de segurança
// adicional para quem chamar esta rota sem nenhum filtro de data.
const MAX_ROWS_WITH_DATE_FILTER = 5000;
const MAX_ROWS_WITHOUT_DATE_FILTER = 500;

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // `to` é opcional: com só `from`, o filtro fica "a partir de" (mesmo comportamento do
  // carregamento inicial em `page.tsx`, que nunca tetou vencimentos futuros).
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((from && (!fromDate || Number.isNaN(fromDate.getTime()))) || (to && (!toDate || Number.isNaN(toDate.getTime())))) {
    return NextResponse.json({ error: "Parâmetro de data inválido." }, { status: 400 });
  }

  // Sem filtro de data, o teto (MAX_ROWS_WITHOUT_DATE_FILTER) precisa pegar os lançamentos MAIS
  // RECENTES (não os mais antigos) — mesmo padrão de `/api/estoque/compras` (`orderBy: { data:
  // "desc" }` antes do `take`). Por isso buscamos em ordem decrescente e devolvemos de volta em
  // ordem crescente (reverse), para manter o mesmo contrato de ordenação (`asc`) que o ramo com
  // filtro de data já usa e que a tela espera para exibir a lista.
  const receivables = await prisma.receivable.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(status ? { status: status as never } : {}),
      ...(fromDate ? { dataVencimento: { gte: fromDate, ...(toDate ? { lte: toDate } : {}) } } : {}),
    },
    orderBy: { dataVencimento: fromDate ? "asc" : "desc" },
    take: fromDate ? MAX_ROWS_WITH_DATE_FILTER : MAX_ROWS_WITHOUT_DATE_FILTER,
    include: {
      categoria: { select: { name: true } },
      createdBy: { select: { name: true } },
      empresa: { select: { name: true } },
    },
  });

  return NextResponse.json({ receivables: fromDate ? receivables : receivables.slice().reverse() });
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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo da requisição inválido (esperado JSON)." }, { status: 400 });
  }
  if (!body.categoriaId || !body.dataCompetencia || !body.dataVencimento) {
    return NextResponse.json(
      { error: "Categoria, competência e vencimento são obrigatórios." },
      { status: 400 }
    );
  }
  // Dias gravados à meia-noite de São Paulo (03:00Z), como no resto do Portal. Ver `parseDayInput`.
  const dataCompetencia = parseDayInput(body.dataCompetencia);
  const dataVencimento = parseDayInput(body.dataVencimento);
  const dataRecebimento = body.dataRecebimento ? parseDayInput(body.dataRecebimento) : null;
  if (!dataCompetencia || !dataVencimento || (body.dataRecebimento && !dataRecebimento)) {
    return NextResponse.json({ error: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }
  if (!body.cliente || !String(body.cliente).trim()) {
    return NextResponse.json({ error: "Cliente é obrigatório." }, { status: 400 });
  }
  if (!body.descricao || !String(body.descricao).trim()) {
    return NextResponse.json({ error: "Descrição é obrigatória." }, { status: 400 });
  }
  const valor = Number(body.valor);
  if (!body.valor || !Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ error: "Valor é obrigatório e deve ser maior que zero." }, { status: 400 });
  }

  // Lista curada de "receber de um cliente" (`RECEIVABLE_PAYMENT_METHODS`, a mesma que a própria
  // tela de Contas a Receber já usa no `<select>`, ver `contas-receber-client.tsx`). Campo opcional
  // (nullable): ausência/null continua aceita normalmente; só um valor PRESENTE fora da lista
  // (inclusive um que nem exista no enum PaymentMethod do Postgres) é rejeitado aqui, em vez de cair
  // num 500 cru do Prisma na hora de gravar. Mesmo padrão de `/api/financeiro/pagar` (achado do
  // Teulis, 2026-11).
  if (body.formaRecebimento && !(RECEIVABLE_PAYMENT_METHODS as readonly string[]).includes(body.formaRecebimento)) {
    return NextResponse.json({ error: "Forma de recebimento inválida." }, { status: 400 });
  }

  // FinancialCategory é cadastro global (sem empresaId), então basta existir — não há "pertencer
  // à loja" para checar aqui. Mesmo padrão usado em `/api/financeiro/pagar`.
  const categoria = await prisma.financialCategory.findUnique({ where: { id: body.categoriaId } });
  if (!categoria) {
    return NextResponse.json({ error: "Categoria financeira não encontrada." }, { status: 400 });
  }

  // Parcelamento: mesmo padrão de `/api/financeiro/pagar` — quando marcado, a quantidade de
  // parcelas é obrigatória e define quantos lançamentos `Receivable` serão criados de uma vez (ver
  // bloco da transação abaixo). O `valor` digitado acima é o TOTAL do recebimento, dividido entre as
  // parcelas por `splitInstallments` (`src/lib/finance.ts`). `parcelaAtual` não é mais pedido ao
  // criar (a série sempre nasce 1/N, 2/N, ..., N/N): só existe como metadado de leitura ao editar uma
  // parcela já existente, e o PATCH (`[id]/route.ts`) não deixa mudar isso depois de criado.
  const parcelado = !!body.parcelado;
  let quantidadeParcelas: number | null = null;
  if (parcelado) {
    quantidadeParcelas = Number(body.quantidadeParcelas);
    if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 2 || quantidadeParcelas > 120) {
      return NextResponse.json(
        { error: "Para um lançamento parcelado, informe a quantidade de parcelas (um número inteiro entre 2 e 120)." },
        { status: 400 }
      );
    }
    // `splitInstallments` dá no mínimo 1 centavo pra cada parcela (ver comentário lá) — só é
    // possível se o valor total tiver pelo menos `quantidadeParcelas` centavos. Sem esta checagem,
    // um valor pequeno pra muitas parcelas geraria parcela(s) com valor ZERO, violando a mesma regra
    // que todo `Receivable` segue ("Valor é obrigatório e deve ser maior que zero", checada acima pro
    // total, mas nunca pra cada parcela individual antes de existir este bloco).
    const valorCentavos = Math.round(valor * 100);
    if (valorCentavos < quantidadeParcelas) {
      const minimo = (quantidadeParcelas / 100).toFixed(2).replace(".", ",");
      return NextResponse.json(
        {
          error: `Valor total pequeno demais para ${quantidadeParcelas} parcelas: cada parcela precisa valer pelo menos R$ 0,01, então o mínimo para essa quantidade é R$ ${minimo}.`,
        },
        { status: 400 }
      );
    }
  }

  const status = body.status || "EM_ABERTO";

  const preDelta = balanceDelta(1, status, valor);
  if (preDelta && body.bankAccountId) {
    const bankAccount = await prisma.bankAccount.findUnique({ where: { id: body.bankAccountId } });
    if (!bankAccount || bankAccount.empresaId !== empresa.id) {
      return NextResponse.json({ error: "Conta bancária inválida para esta loja." }, { status: 400 });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    if (!parcelado) {
      // ---- fluxo de sempre: um único lançamento ----
      // number vem do id sequencial autoincrementado pelo Postgres (sequence),
      // não de COUNT(*): evita duas requisições simultâneas gerarem o mesmo
      // número (condição de corrida real com o COUNT(*) anterior).
      let row = await tx.receivable.create({
        data: {
          number: body.number || "",
          cliente: body.cliente,
          descricao: body.descricao,
          categoriaId: body.categoriaId,
          centroCusto: body.centroCusto || null,
          empresaId: empresa.id,
          valor,
          dataCompetencia,
          dataVencimento,
          dataRecebimento,
          bankAccountId: body.bankAccountId || null,
          formaRecebimento: body.formaRecebimento || null,
          parcelado: false,
          quantidadeParcelas: null,
          parcelaAtual: null,
          installmentGroupId: null,
          observacoes: body.observacoes || null,
          status,
          createdById: session.user.id,
        },
      });

      if (!body.number) {
        row = await tx.receivable.update({
          where: { id: row.id },
          data: { number: `CR-${String(row.sequence).padStart(5, "0")}` },
        });
      }

      const delta = balanceDelta(1, status, valor);
      if (delta && row.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: row.bankAccountId },
          data: { saldoAtual: { increment: delta } },
        });
      }

      return [row];
    }

    // ---- parcelado: N lançamentos de uma vez, cada um com a fatia do valor total
    // (`splitInstallments`) e vencimento/competência deslocados em 1 mês por parcela — mesmo padrão
    // de `/api/financeiro/pagar` (`addMonths` do date-fns já lida sozinho com meses mais curtos, tipo
    // fevereiro, sem "rolar" pro mês seguinte, então nenhuma data extra de clamping é necessária
    // aqui). ----
    const installmentGroupId = randomUUID();
    const valores = splitInstallments(valor, quantidadeParcelas!);
    const rows = await tx.receivable.createManyAndReturn({
      data: valores.map((valorParcela, i) => ({
        // Número próprio por parcela — nunca `body.number` (a tela nunca envia um valor nele, mesmo
        // padrão de Contas a Pagar). Mesmo padrão `CR-PARC-<id>-<i+1>`: não depende da
        // sequence/update em 2 passos porque `createManyAndReturn` não permite emendar um update por
        // linha antes de saber a sequence de cada uma sem um loop; usar um id só
        // (`installmentGroupId`) já garante número distinto E identificável como a mesma série.
        number: `CR-PARC-${installmentGroupId.slice(-6)}-${i + 1}`,
        cliente: body.cliente,
        descricao: body.descricao,
        categoriaId: body.categoriaId,
        centroCusto: body.centroCusto || null,
        empresaId: empresa.id,
        valor: valorParcela,
        dataCompetencia: addMonths(dataCompetencia, i),
        dataVencimento: addMonths(dataVencimento, i),
        dataRecebimento,
        bankAccountId: body.bankAccountId || null,
        formaRecebimento: body.formaRecebimento || null,
        parcelado: true,
        quantidadeParcelas,
        parcelaAtual: i + 1,
        installmentGroupId,
        observacoes: body.observacoes || null,
        status,
        createdById: session.user.id,
      })),
    });

    // Saldo da conta bancária: UM único ajuste com o valor TOTAL digitado (não um por parcela, e
    // não o total repetido N vezes) — matematicamente idêntico à soma dos ajustes de cada parcela,
    // porque a soma das fatias de `splitInstallments` bate exatamente com `valor`.
    const delta = balanceDelta(1, status, valor);
    const bankAccountId = body.bankAccountId || null;
    if (delta && bankAccountId) {
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { saldoAtual: { increment: delta } },
      });
    }

    return rows;
  });

  // Auditoria por lançamento (igual ao fluxo de sempre, 1 entrada por `Receivable`), mesmo quando a
  // chamada gerou várias parcelas de uma vez — 1 única chamada (`createMany`) em vez de um loop de
  // `create` (até 120 round-trips ao banco, 1 por parcela, fora da transação principal).
  await prisma.auditLog.createMany({
    data: created.map((row) => ({
      userId: session.user.id,
      empresaId: empresa.id,
      action: "CREATE",
      entityType: "Receivable",
      entityId: row.id,
      after: JSON.stringify(row),
    })),
  });

  // A tela (ver `submit()`/`duplicate()` em `contas-receber-client.tsx`) só olha
  // `receivable.dataVencimento` para avisar se o lançamento ficou fora da janela de 120 dias que
  // `refresh()` busca — devolver a 1ª parcela (a de vencimento mais próximo) como `receivable`
  // mantém esse contrato sem mudar a tela.
  const receivable = created.find((row) => row.parcelaAtual === 1) ?? created[0];
  return NextResponse.json({ receivable, parcelas: created.length });
}
