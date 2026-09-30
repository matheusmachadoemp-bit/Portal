import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// Mesmo critério de normalização de nome usado em outras comparações do sistema (ex.
// `src/app/api/vendas/importar-itens/route.ts`, `src/lib/saipos-mapper.ts`): remove acento,
// baixa a caixa e tira espaço nas pontas, pra "Queijo Mussarela" e "queijo   mussarela " baterem.
function normalizeText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.transfer.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } }, origemEmpresa: true, destinoEmpresa: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });

  const [temAcessoOrigem, temAcessoDestino] = await Promise.all([
    assertEmpresaAccess(session.user.id, session.user.role, existing.origemEmpresaId),
    assertEmpresaAccess(session.user.id, session.user.role, existing.destinoEmpresaId),
  ]);
  if (!temAcessoOrigem && !temAcessoDestino) {
    return NextResponse.json({ error: "Sem acesso a essa transferência." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite atualizar transferências entre lojas." },
      { status: 403 }
    );
  }

  const novoStatus = body.status as string | undefined;
  // Exige o estado ANTERIOR específico (não só "não é já RECEBIDA/ENVIADA"), porque a rota
  // aceita qualquer valor do enum em `status` sem validar a transição — um PATCH pra um status
  // qualquer no meio do caminho (ex.: de volta pra "SOLICITADA") reabriria a checagem antiga e
  // um novo PATCH "RECEBIDA"/"ENVIADA" logo em seguida creditaria/debitaria de novo. Achado real
  // do Teulis: RECEBIDA → SOLICITADA → RECEBIDA de novo duplicava o crédito no destino (10→35→60
  // em vez de continuar 35), sem precisar de concorrência nenhuma — só 3 chamadas sequenciais.
  // `TransferStatus` (prisma/schema.prisma): SOLICITADA → SEPARACAO → ENVIADA → RECEBIDA, mais
  // DIVERGENCIA solto — só SOLICITADA/SEPARACAO podem virar ENVIADA, e só ENVIADA pode virar
  // RECEBIDA.
  const disparaSaida = novoStatus === "ENVIADA" && (existing.status === "SOLICITADA" || existing.status === "SEPARACAO");
  const disparaEntrada = novoStatus === "RECEBIDA" && existing.status === "ENVIADA";
  if (disparaSaida && !temAcessoOrigem) {
    return NextResponse.json({ error: "Apenas a loja de origem pode enviar esta transferência." }, { status: 403 });
  }
  if (novoStatus === "RECEBIDA" && !temAcessoDestino) {
    return NextResponse.json({ error: "Apenas a loja de destino pode confirmar o recebimento desta transferência." }, { status: 403 });
  }

  // `disparaSaida`/`disparaEntrada` acima só olham pro estado ANTERIOR pra decidir se disparam o
  // efeito colateral desta chamada — mas, sozinhos, não impedem que `status` seja jogado pra TRÁS
  // por uma chamada anterior (ex.: um PATCH direto pra "SOLICITADA", que nenhum dos dois guards
  // trava, já que nenhum dos dois tem "SOLICITADA" como alvo) e depois reencaminhado pra FRENTE de
  // novo — já que "SOLICITADA" é, por definição, um dos predecessores LEGÍTIMOS de "ENVIADA". Sem
  // este bloco, a sequência RECEBIDA → PATCH(SOLICITADA) → PATCH(ENVIADA) → PATCH(RECEBIDA)
  // debitaria a origem e creditaria o destino uma SEGUNDA vez, mesmo com o fix acima, porque o
  // 3º PATCH (ENVIADA) veria `existing.status === "SOLICITADA"` — uma transição válida de verdade
  // do ponto de vista do `disparaSaida` isolado. Nenhum lugar do app hoje manda `status` por essa
  // rota além de "ENVIADA"/"RECEBIDA" (só `movimentacoes-client.tsx`, funções `marcarEnviada` e
  // `confirmarRecebimento`) — travar aqui fecha o "botão de reset" sem tirar nada em uso.
  if (novoStatus !== undefined && novoStatus !== "ENVIADA" && novoStatus !== "RECEBIDA") {
    return NextResponse.json({ error: "Status inválido para esta operação." }, { status: 400 });
  }
  if (novoStatus === "ENVIADA" && !disparaSaida) {
    return NextResponse.json(
      { error: "Só é possível marcar como enviada uma transferência ainda não enviada." },
      { status: 400 }
    );
  }
  if (novoStatus === "RECEBIDA" && !disparaEntrada) {
    return NextResponse.json(
      { error: "Só é possível confirmar o recebimento de uma transferência que já foi enviada." },
      { status: 400 }
    );
  }

  // Antes disso, cada item da transferência virava 2-3 operações (create do
  // movimento, update do estoque do ingrediente, update da quantidade
  // recebida) empilhadas num único array passado pra `prisma.$transaction(ops)`
  // — a API de "sequential operations" do Prisma, que roda cada operação uma
  // atrás da outra dentro de uma transação interativa com timeout padrão de
  // 5s. Uma transferência pode incluir um número grande de ingredientes (até
  // o catálogo inteiro da loja), e isso derrubaria a operação inteira sem
  // nada aplicado (mesmo bug encontrado e corrigido em
  // `syncEmpresaSaiposSales`, ver `src/lib/saipos-sync.ts`). Agora o número
  // de operações dentro da transação é constante (no máximo 3), não importa
  // quantos itens a transferência tenha.
  const ops = [];

  if (disparaSaida && existing.items.length > 0) {
    // Acumulador por ingredientId (mesmo padrão do `estoqueCorrente` do lado do recebimento,
    // abaixo) — sem isso, duas `TransferItem` apontando pro MESMO insumo de origem (a tela de
    // criação não impede escolher o mesmo insumo duas vezes) liam o mesmo snapshot pré-transação
    // (`item.ingredient.estoqueAtual`) pra calcular o desconto, e como cada ingredientId só podia
    // aparecer UMA vez no UNNEST usado pelo UPDATE em lote abaixo, só o desconto do último item
    // processado "vencia" — o outro se perdia (achado real do Teulis: insumo com 100, itens de
    // 30+10, resultado errado 90 em vez de 60).
    const estoqueCorrenteOrigem = new Map<string, number>();
    const movimentosSaida: {
      ingredientId: string;
      empresaId: string;
      type: "TRANSFERENCIA";
      quantidade: number;
      estoqueApos: number;
      motivo: string;
      origin: string;
      destino: string;
      autorizadoPor: string | null;
      createdById: string;
    }[] = [];

    for (const item of existing.items) {
      const base = estoqueCorrenteOrigem.get(item.ingredientId) ?? item.ingredient.estoqueAtual;
      const estoqueApos = Math.max(0, base - item.quantidadeEnviada);
      estoqueCorrenteOrigem.set(item.ingredientId, estoqueApos);

      movimentosSaida.push({
        ingredientId: item.ingredientId,
        empresaId: existing.origemEmpresaId,
        type: "TRANSFERENCIA",
        quantidade: item.quantidadeEnviada,
        estoqueApos,
        motivo: `Transferência enviada para ${existing.destinoEmpresa.name}`,
        origin: "TRANSFERENCIA_ENVIADA",
        destino: existing.destinoEmpresa.name,
        autorizadoPor: body.responsavelEnvio || session.user.name || null,
        createdById: session.user.id,
      });
    }

    const ingredientIds = Array.from(estoqueCorrenteOrigem.keys());
    const novosEstoques = ingredientIds.map((ingredientId) => estoqueCorrenteOrigem.get(ingredientId)!);

    ops.push(
      prisma.stockMovement.createMany({ data: movimentosSaida }),
      prisma.$executeRaw`
        UPDATE "Ingredient" AS ing
        SET "estoqueAtual" = v.estoque_atual
        FROM UNNEST(${ingredientIds}::text[], ${novosEstoques}::float8[]) AS v(ingredient_id, estoque_atual)
        WHERE ing."id" = v.ingredient_id
      `
    );
  }

  if (disparaEntrada && Array.isArray(body.quantidadesRecebidas) && body.quantidadesRecebidas.length > 0) {
    const recebidas = (body.quantidadesRecebidas as { itemId: string; quantidade: number }[])
      // Descarta itemId que não pertence a esta transferência — nunca confia em input vindo do
      // cliente sem checar contra o que já foi carregado em `existing.items`.
      .filter((q) => existing.items.some((item) => item.id === q.itemId))
      .map((q) => ({ itemId: q.itemId, quantidade: Number(q.quantidade) || 0 }));
    const itemIds = recebidas.map((q) => q.itemId);
    const quantidades = recebidas.map((q) => q.quantidade);

    if (itemIds.length > 0) {
      ops.push(prisma.$executeRaw`
        UPDATE "TransferItem" AS ti
        SET "quantidadeRecebida" = v.quantidade
        FROM UNNEST(${itemIds}::text[], ${quantidades}::float8[]) AS v(item_id, quantidade)
        WHERE ti."id" = v.item_id
      `);
    }

    // Até aqui, confirmar o recebimento só registrava a quantidade recebida no próprio
    // TransferItem — o insumo da loja de DESTINO nunca ganhava o estoque de volta (gap
    // identificado na fusão de Movimentações+Transferências; usuário decidiu que o sistema
    // deve resolver sozinho, sem exigir um de-para manual entre insumos das duas lojas).
    // Casa por NOME normalizado (ver `normalizeText` acima) com um insumo ativo já cadastrado
    // na empresa de destino: se achar, credita o estoque dele; se não achar, cria um insumo
    // novo lá (nome/unidade vindos do item de origem, estoque inicial = quantidade recebida).
    // Item com quantidade recebida 0 (não chegou / recusado) não gera crédito nem insumo novo.
    const recebidasComQuantidade = recebidas.filter((q) => q.quantidade > 0);
    if (recebidasComQuantidade.length > 0) {
      const itemById = new Map(existing.items.map((item) => [item.id, item]));
      const destinoIngredients = await prisma.ingredient.findMany({
        where: { empresaId: existing.destinoEmpresaId, active: true },
        select: { id: true, name: true, estoqueAtual: true },
      });
      const destinoPorNome = new Map(destinoIngredients.map((i) => [normalizeText(i.name), i]));

      // Estoque "corrente" por insumo de destino conforme os créditos desta transferência vão
      // sendo empilhados — cobre o caso (raro) de dois itens da mesma transferência caírem no
      // mesmo insumo de destino (mesmo nome normalizado), pra o segundo crédito somar em cima
      // do primeiro em vez de um sobrescrever o outro.
      const estoqueCorrente = new Map<string, number>();
      // Insumos novos que serão criados na loja de destino nesta chamada, por nome normalizado
      // — pra não criar duplicado se dois itens da mesma transferência caírem no mesmo insumo
      // novo (ex.: mesmo insumo de origem informado duas vezes por engano).
      const novosPorNome = new Map<string, { id: string; name: string; unidade: string }>();
      const movimentosEntrada: {
        ingredientId: string;
        empresaId: string;
        type: "ENTRADA";
        quantidade: number;
        estoqueApos: number;
        motivo: string;
        origin: string;
        origem: string;
        autorizadoPor: string | null;
        createdById: string;
      }[] = [];

      for (const recebida of recebidasComQuantidade) {
        const item = itemById.get(recebida.itemId)!;
        const nomeNormalizado = normalizeText(item.ingredient.name);
        const existenteDestino = destinoPorNome.get(nomeNormalizado);

        let ingredientId: string;
        let estoqueBase: number;
        if (existenteDestino) {
          ingredientId = existenteDestino.id;
          estoqueBase = estoqueCorrente.get(ingredientId) ?? existenteDestino.estoqueAtual;
        } else {
          const novo = novosPorNome.get(nomeNormalizado);
          if (novo) {
            ingredientId = novo.id;
            estoqueBase = estoqueCorrente.get(ingredientId) ?? 0;
          } else {
            ingredientId = randomUUID();
            novosPorNome.set(nomeNormalizado, { id: ingredientId, name: item.ingredient.name, unidade: item.unidade });
            estoqueBase = 0;
          }
        }

        const estoqueApos = estoqueBase + recebida.quantidade;
        estoqueCorrente.set(ingredientId, estoqueApos);

        movimentosEntrada.push({
          ingredientId,
          empresaId: existing.destinoEmpresaId,
          type: "ENTRADA",
          quantidade: recebida.quantidade,
          estoqueApos,
          motivo: `Transferência recebida de ${existing.origemEmpresa.name}`,
          origin: "TRANSFERENCIA_RECEBIDA",
          origem: existing.origemEmpresa.name,
          autorizadoPor: body.responsavelRecebimento || session.user.name || null,
          createdById: session.user.id,
        });
      }

      // Ordem importa: cria os insumos novos primeiro (senão o StockMovement referenciando o
      // ingredientId deles quebraria a FK), só depois credita os já existentes e lança os
      // movimentos — igual ao padrão em ops acima (bulk via UNNEST, não uma operação por item).
      if (novosPorNome.size > 0) {
        ops.push(
          prisma.ingredient.createMany({
            data: Array.from(novosPorNome.values()).map((n) => ({
              id: n.id,
              empresaId: existing.destinoEmpresaId,
              name: n.name,
              unidade: n.unidade,
              estoqueAtual: estoqueCorrente.get(n.id) ?? 0,
            })),
          })
        );
      }

      const novoIds = new Set(Array.from(novosPorNome.values()).map((n) => n.id));
      const idsExistentesParaAtualizar = Array.from(estoqueCorrente.keys()).filter((id) => !novoIds.has(id));
      if (idsExistentesParaAtualizar.length > 0) {
        const estoquesFinais = idsExistentesParaAtualizar.map((id) => estoqueCorrente.get(id)!);
        ops.push(prisma.$executeRaw`
          UPDATE "Ingredient" AS ing
          SET "estoqueAtual" = v.estoque_atual
          FROM UNNEST(${idsExistentesParaAtualizar}::text[], ${estoquesFinais}::float8[]) AS v(ingredient_id, estoque_atual)
          WHERE ing."id" = v.ingredient_id
        `);
      }

      ops.push(prisma.stockMovement.createMany({ data: movimentosEntrada }));
    }
  }

  ops.push(
    prisma.transfer.update({
      where: { id },
      data: {
        status: (novoStatus ?? undefined) as never,
        responsavelRecebimento: body.responsavelRecebimento ?? undefined,
        dataEnvio: novoStatus === "ENVIADA" ? new Date() : undefined,
        dataRecebimento: novoStatus === "RECEBIDA" ? new Date() : undefined,
        observacao: body.observacao !== undefined ? body.observacao || null : undefined,
      },
    })
  );

  const results = await prisma.$transaction(ops);
  const transfer = results[results.length - 1];

  return NextResponse.json({ transfer });
}
