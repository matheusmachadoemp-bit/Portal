import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { lockIngredientStocks, ESTOQUE_TX_OPTIONS, type TransferStatusValue } from "@/lib/estoque";

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

/**
 * Lançado DENTRO da transação quando a guarda condicional do `UPDATE` final (ver comentário logo
 * acima de `tx.transfer.updateMany` no handler) detecta que outra requisição já mudou o status
 * desta transferência entre a leitura de `existing` e aqui — nunca deixa a operação de
 * negócio (débito/crédito de estoque) ser aplicada de novo em cima de um estado que já mudou.
 * Capturado fora do `prisma.$transaction` só para virar uma resposta 409 clara em vez de 500.
 */
class TransferStatusConflictError extends Error {}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.transfer.findUnique({
    where: { id },
    // `ingredient.category` só é usado abaixo pra achar a categoria equivalente na loja de
    // destino (por `key`, igual nos dois lados) quando o insumo precisa ser criado lá — ver
    // comentário em "Insumos novos" mais abaixo.
    include: { items: { include: { ingredient: { include: { category: true } } } }, origemEmpresa: true, destinoEmpresa: true },
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

  const novoStatus = body.status as TransferStatusValue | undefined;
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

  // Antes desta correção, cada item da transferência virava 2-3 operações (create do movimento,
  // update do estoque do ingrediente, update da quantidade recebida) empilhadas num único array
  // passado pra `prisma.$transaction(ops)` — a API de "sequential operations" do Prisma. O débito
  // (lado ENVIADA) e o crédito (lado RECEBIDA) liam `estoqueAtual` de um snapshot carregado ANTES
  // da transação (`item.ingredient.estoqueAtual`/`destinoIngredients` lido fora da transação) e
  // calculavam o novo valor em JS a partir dele — duas transferências concorrentes tocando o
  // MESMO insumo (como origem OU destino) podiam ler o mesmo valor "antigo" e uma gravar por cima
  // da outra sem nunca ver o efeito dela (lost update; achado P0 de revisão de QA, 2026-11).
  //
  // Agora tudo roda dentro de UMA transação interativa (`prisma.$transaction(async (tx) => ...)`,
  // com `ESTOQUE_TX_OPTIONS` (@/lib/estoque) — o padrão do Prisma, 2s de espera/5s de duração, é
  // apertado demais pra uma transferência grande + lock de linha) que relê o `estoqueAtual` mais
  // recente de cada insumo envolvido via `lockIngredientStocks` (`SELECT ... FOR UPDATE`,
  // @/lib/estoque) DENTRO da transação, sempre ANTES de calcular o novo valor — nunca a partir do
  // snapshot carregado fora dela. `lockIngredientStocks` já trava sempre na mesma ordem (por id,
  // ordenado) e com uma query por insumo, nunca uma só com `IN (...)`, pra duas transferências
  // concorrentes em sentidos opostos tocando o mesmo par de insumos não entrarem em deadlock — e
  // lança erro em vez de omitir silenciosamente um id que não exista mais, então nunca cai de
  // volta num valor pré-transação — ver o comentário na própria função para o racional completo.
  let transfer;
  try {
    transfer = await prisma.$transaction(async (tx) => {
      // Guarda condicional contra duplo clique/concorrência: só os blocos abaixo (débito de
      // origem, crédito de destino) só devem rodar se o status ainda for EXATAMENTE o que foi lido
      // em `existing`, ANTES desta transação — por isso o guard é o PRIMEIRO passo dentro dela, não
      // "no finalzinho". Achado de QA, 2026-11: dois PATCH verdadeiramente simultâneos pro mesmo
      // `id` com `status: "RECEBIDA"` (duplo clique, duas abas abertas) liam o MESMO
      // `existing.status === "ENVIADA"` fora da transação e ambos calculavam `disparaEntrada =
      // true` — o lock de `lockIngredientStocks` protege a soma de `estoqueAtual` de um insumo
      // específico, mas não trava a linha da própria `Transfer`; se as duas chamadas não
      // disputassem nenhum insumo em comum (ou disputassem e serializassem, mas cada uma já tivesse
      // decidido aplicar o crédito antes de travar), o destino acabava creditado duas vezes para uma
      // única entrega física.
      //
      // `updateMany` com `where: { id, status: existing.status }` funciona como mutex: o próprio
      // UPDATE do Postgres trava a linha da `Transfer` até a transação terminar (commit/rollback) —
      // então a segunda chamada concorrente só prossegue depois que a primeira comitar, e ao
      // prosseguir reavalia o WHERE contra o status JÁ ATUALIZADO (não mais igual a
      // `existing.status`), afetando 0 linhas. Como isso acontece ANTES de qualquer débito/crédito
      // de estoque, a segunda chamada nunca chega a aplicar a operação de negócio — ela só descobre
      // o conflito e desiste. Mesmo padrão (`updateMany` com guarda de status + contagem) já usado
      // em `iniciarProductionOrder` (`src/lib/producao-server.ts`).
      //
      // Todos os campos que o `tx.transfer.update(...)` fazia antes (status, responsável,
      // dataEnvio/dataRecebimento, observação) entram aqui porque nenhum deles depende de algo
      // calculado DEPOIS, nos blocos de estoque — dá pra fazer tudo numa única escrita guardada.
      const { count } = await tx.transfer.updateMany({
        where: { id, status: existing.status },
        data: {
          status: novoStatus ?? undefined,
          responsavelRecebimento: body.responsavelRecebimento ?? undefined,
          dataEnvio: novoStatus === "ENVIADA" ? new Date() : undefined,
          dataRecebimento: novoStatus === "RECEBIDA" ? new Date() : undefined,
          observacao: body.observacao !== undefined ? body.observacao || null : undefined,
        },
      });
      if (count === 0) throw new TransferStatusConflictError();

      if (disparaSaida && existing.items.length > 0) {
        // Trava e relê, AGORA, o estoque de todos os insumos de origem envolvidos — antes de
        // calcular qualquer desconto. Cobre tanto a concorrência entre duas transferências diferentes
        // tocando o mesmo insumo quanto (via o acumulador abaixo) duas `TransferItem` desta MESMA
        // transferência apontando pro mesmo insumo (a tela de criação não impede escolher o mesmo
        // insumo duas vezes) — achado real do Teulis: insumo com 100, itens de 30+10, resultado
        // errado 90 em vez de 60, quando cada ingredientId só contava uma vez no UPDATE em lote.
        const ingredientIdsOrigem = Array.from(new Set(existing.items.map((item) => item.ingredientId)));
        const estoqueAtualOrigemMap = await lockIngredientStocks(tx, ingredientIdsOrigem);

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
          const estoqueAtualOrigem = estoqueAtualOrigemMap.get(item.ingredientId);
          if (estoqueAtualOrigem === undefined) {
            throw new Error(`Insumo ${item.ingredientId} não encontrado ao enviar transferência.`);
          }
          const base = estoqueCorrenteOrigem.get(item.ingredientId) ?? estoqueAtualOrigem;
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

        await tx.stockMovement.createMany({ data: movimentosSaida });
        await tx.$executeRaw`
          UPDATE "Ingredient" AS ing
          SET "estoqueAtual" = v.estoque_atual
          FROM UNNEST(${ingredientIds}::text[], ${novosEstoques}::float8[]) AS v(ingredient_id, estoque_atual)
          WHERE ing."id" = v.ingredient_id
        `;
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
          await tx.$executeRaw`
            UPDATE "TransferItem" AS ti
            SET "quantidadeRecebida" = v.quantidade
            FROM UNNEST(${itemIds}::text[], ${quantidades}::float8[]) AS v(item_id, quantidade)
            WHERE ti."id" = v.item_id
          `;
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

          // Trava, uma por uma em ordem determinística (nome normalizado, alfabética — mesmo
          // racional de ordenar por id em `lockIngredientStocks`, pra duas chamadas concorrentes
          // nunca travarem os mesmos dois nomes em ordens diferentes e entrarem em deadlock), um
          // advisory lock (`pg_advisory_xact_lock`, liberado só no fim da transação — mesmo
          // mecanismo de `withUniqueProductName` em `src/lib/ficha-nome-server.ts` e
          // `autoLinkResaleIngredientLocked` em `src/lib/ficha-autolink.ts`) por combinação
          // (empresa de destino, nome normalizado) presente nesta entrega. Precisa vir ANTES do
          // `findMany` abaixo: "ver se já existe um insumo com esse nome → decidir criar um novo" é
          // um check-then-act clássico — sem travar primeiro, duas transferências concorrentes
          // entregando o MESMO nome novo (ainda não cadastrado) pro MESMO destino podem ambas ver
          // "não existe" e ambas criarem um `Ingredient` duplicado (não há `@@unique` em
          // `[empresaId, name]`). Como é um advisory lock (não um lock de linha de uma linha que já
          // existe), cobre também o caso do nome já existir — a releitura por nome só é confiável
          // depois da trava, esteja o insumo lá ou não.
          const nomesNormalizadosDestino = Array.from(
            new Set(recebidasComQuantidade.map((q) => normalizeText(itemById.get(q.itemId)!.ingredient.name)))
          ).sort();
          for (const nome of nomesNormalizadosDestino) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`transferencia-ingrediente-destino:${existing.destinoEmpresaId}:${nome}`}, 0))`;
          }

          const destinoIngredients = await tx.ingredient.findMany({
            where: { empresaId: existing.destinoEmpresaId, active: true },
            select: { id: true, name: true, estoqueAtual: true },
          });
          const destinoPorNome = new Map(destinoIngredients.map((i) => [normalizeText(i.name), i]));

          // Trava e relê, AGORA, o estoque de todos os insumos de destino já existentes que vão
          // receber crédito nesta chamada — antes de qualquer cálculo. Cobre o mesmo insumo sendo
          // origem de OUTRA transferência (debitado por outra chamada concorrente) e/ou destino de
          // uma segunda transferência concorrente ao mesmo tempo — sem isso, o `estoqueAtual` lido
          // acima (`destinoIngredients`, fora do lock) já pode estar desatualizado quando a conta é
          // feita a seguir.
          const existingIngredientIdsDestino = Array.from(
            new Set(
              recebidasComQuantidade
                .map((q) => destinoPorNome.get(normalizeText(itemById.get(q.itemId)!.ingredient.name))?.id)
                .filter((id): id is string => !!id)
            )
          );
          const estoqueAtualDestinoMap = await lockIngredientStocks(tx, existingIngredientIdsDestino);

          // Estoque "corrente" por insumo de destino conforme os créditos desta transferência vão
          // sendo empilhados — cobre o caso (raro) de dois itens da mesma transferência caírem no
          // mesmo insumo de destino (mesmo nome normalizado), pra o segundo crédito somar em cima
          // do primeiro em vez de um sobrescrever o outro.
          const estoqueCorrente = new Map<string, number>();
          // Categoria equivalente na loja de destino pra cada `StockCategory.key` presente nos
          // insumos de origem desta transferência — `key` é único só por `(empresaId, key)`, mas
          // convencionalmente a mesma categoria (ex. "pescados") existe com a mesma key em cada loja
          // (ver seed). 1 query só, fora do loop abaixo.
          const categoryKeysOrigem = [...new Set(recebidasComQuantidade.map((q) => itemById.get(q.itemId)!.ingredient.category?.key).filter((k): k is string => !!k))];
          const destinoCategoriaIdPorKey = categoryKeysOrigem.length
            ? new Map(
                (
                  await tx.stockCategory.findMany({
                    where: { empresaId: existing.destinoEmpresaId, key: { in: categoryKeysOrigem } },
                    select: { id: true, key: true },
                  })
                ).map((c) => [c.key, c.id])
              )
            : new Map<string, string>();
          // Insumos novos que serão criados na loja de destino nesta chamada, por nome normalizado —
          // pra não criar duplicado se dois itens da mesma transferência caírem no mesmo insumo novo
          // (ex.: mesmo insumo de origem informado duas vezes por engano). Carrega os campos
          // descritivos/de custo do insumo de ORIGEM (preço, categoria, embalagem, fornecedor em
          // texto livre etc.) — achado de produção (02/10/2026): sem isso, um insumo criado
          // automaticamente aqui nascia com `precoAtual` 0 e sem categoria/fornecedor (`categoryId`/
          // `fornecedorPrincipalId` null), entrando silenciosamente no CMV como "custo zero" e nas
          // listagens como "sem categoria"/"sem fornecedor" até alguém completar o cadastro na mão.
          // `fornecedorPrincipalId` (relação com `Supplier`, que é 100% por loja, sem `key`
          // compartilhada como `StockCategory`) propositalmente NÃO é copiado — não tem como saber
          // se existe um fornecedor equivalente cadastrado na loja de destino; só o texto livre
          // `fornecedor` (sem FK) é copiado, como referência.
          const novosPorNome = new Map<
            string,
            {
              id: string;
              name: string;
              unidade: string;
              precoAtual: number;
              quantidadeEmbalagem: number;
              percentualPerda: number;
              fornecedor: string | null;
              unidadeCompra: string | null;
              fatorConversao: number;
              pesoEmbalagem: number | null;
              rendimentoAproveitavel: number | null;
              perecivel: boolean;
              setor: string | null;
              categoryId: string | null;
            }
          >();
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
              const estoqueAtualDestino = estoqueAtualDestinoMap.get(ingredientId);
              if (estoqueAtualDestino === undefined) {
                throw new Error(`Insumo ${ingredientId} não encontrado ao receber transferência.`);
              }
              estoqueBase = estoqueCorrente.get(ingredientId) ?? estoqueAtualDestino;
            } else {
              const novo = novosPorNome.get(nomeNormalizado);
              if (novo) {
                ingredientId = novo.id;
                estoqueBase = estoqueCorrente.get(ingredientId) ?? 0;
              } else {
                ingredientId = randomUUID();
                novosPorNome.set(nomeNormalizado, {
                  id: ingredientId,
                  name: item.ingredient.name,
                  unidade: item.unidade,
                  precoAtual: item.ingredient.precoAtual,
                  quantidadeEmbalagem: item.ingredient.quantidadeEmbalagem,
                  percentualPerda: item.ingredient.percentualPerda,
                  fornecedor: item.ingredient.fornecedor,
                  unidadeCompra: item.ingredient.unidadeCompra,
                  fatorConversao: item.ingredient.fatorConversao,
                  pesoEmbalagem: item.ingredient.pesoEmbalagem,
                  rendimentoAproveitavel: item.ingredient.rendimentoAproveitavel,
                  perecivel: item.ingredient.perecivel,
                  setor: item.ingredient.setor,
                  categoryId: item.ingredient.category ? destinoCategoriaIdPorKey.get(item.ingredient.category.key) ?? null : null,
                });
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
          // movimentos — igual ao padrão acima (bulk via UNNEST, não uma operação por item).
          if (novosPorNome.size > 0) {
            await tx.ingredient.createMany({
              data: Array.from(novosPorNome.values()).map((n) => ({
                id: n.id,
                empresaId: existing.destinoEmpresaId,
                name: n.name,
                unidade: n.unidade,
                estoqueAtual: estoqueCorrente.get(n.id) ?? 0,
                precoAtual: n.precoAtual,
                quantidadeEmbalagem: n.quantidadeEmbalagem,
                percentualPerda: n.percentualPerda,
                fornecedor: n.fornecedor,
                unidadeCompra: n.unidadeCompra,
                fatorConversao: n.fatorConversao,
                pesoEmbalagem: n.pesoEmbalagem,
                rendimentoAproveitavel: n.rendimentoAproveitavel,
                perecivel: n.perecivel,
                setor: n.setor,
                categoryId: n.categoryId,
              })),
            });
          }

          const novoIds = new Set(Array.from(novosPorNome.values()).map((n) => n.id));
          const idsExistentesParaAtualizar = Array.from(estoqueCorrente.keys()).filter((id) => !novoIds.has(id));
          if (idsExistentesParaAtualizar.length > 0) {
            const estoquesFinais = idsExistentesParaAtualizar.map((id) => estoqueCorrente.get(id)!);
            await tx.$executeRaw`
              UPDATE "Ingredient" AS ing
              SET "estoqueAtual" = v.estoque_atual
              FROM UNNEST(${idsExistentesParaAtualizar}::text[], ${estoquesFinais}::float8[]) AS v(ingredient_id, estoque_atual)
              WHERE ing."id" = v.ingredient_id
            `;
          }

          await tx.stockMovement.createMany({ data: movimentosEntrada });
        }
      }

      // A escrita em si já foi feita pela guarda no início (`tx.transfer.updateMany`) — aqui só
      // relê a linha para devolver no response, igual ao que `tx.transfer.update(...)` devolvia
      // antes (sem includes, só os campos escalares).
      const updated = await tx.transfer.findUniqueOrThrow({ where: { id } });

      // Dentro da MESMA transação (mesmo padrão de src/app/api/financeiro/pagar/[id]/route.ts) —
      // se o lançamento de estoque falhar e a transação for revertida (ou a guarda contra duplo
      // clique acima já tiver lançado `TransferStatusConflictError`, nem chegando até aqui), o
      // registro de auditoria reverte/nunca é criado junto, em vez de gravar uma mudança que nunca
      // aconteceu de fato. Só loga quando o status de fato muda (não a cada edição de metadado
      // como `observacao`) — mesmo critério de antes da guarda contra duplo clique.
      if (novoStatus !== undefined) {
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            empresaId: existing.origemEmpresaId,
            action: "UPDATE",
            entityType: "Transfer",
            entityId: id,
            before: JSON.stringify({ status: existing.status }),
            after: JSON.stringify({ status: updated.status, responsavelRecebimento: updated.responsavelRecebimento }),
          },
        });
      }

      return updated;
    }, ESTOQUE_TX_OPTIONS);
  } catch (error) {
    if (error instanceof TransferStatusConflictError) {
      return NextResponse.json(
        {
          error:
            "Esta transferência já foi atualizada por outra requisição (duplo clique ou outra aba aberta). Atualize a página para ver o status atual antes de tentar de novo.",
        },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({ transfer });
}
