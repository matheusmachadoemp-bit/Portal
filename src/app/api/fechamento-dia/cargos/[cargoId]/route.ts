import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess, findUsersWithoutEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/**
 * Atribui responsável/substituto de um `FechamentoCargo` (registro PADRÃO/fixo por loja+cargo —
 * "Gerente"/"Chef de Salão"/"Chef de Cozinha", ver comentário do model em schema.prisma — não um
 * registro por dia). É a primeira rota de ESCRITA para `responsavelId`/`substitutoId`: até aqui só
 * existia leitura (`GET /api/fechamento-dia/status`, que já devolve os dois no JSON), então todo
 * cargo nascia (via seed) com os dois campos `null` e aparecia como "Responsável: não definido" na
 * aba Status do Dia (pedido do usuário: poder escolher a pessoa direto por ali — o dropdown em si é
 * fase 2, do Caio; esta rota só habilita a escrita).
 *
 * Permissão: `canEdit` do módulo "fechamento-dia" como um todo, SEM subcategoria por cargo — mesmo
 * gate já usado por `PATCH /api/fechamento-dia/ocorrencias/[id]` e
 * `POST .../ocorrencias/[id]/transformar` para as outras ações de "gestão" do módulo. Por padrão
 * (`prisma/seed.ts`) isso libera administrador/gestor/gerente/supervisor — o mesmo grupo de
 * "liderança" que já edita Ocorrências/Perguntas — e nega líder/funcionário/marketing/financeiro.
 * Duas alternativas mais óbvias foram descartadas de propósito:
 * - `canExecute`: liberaria para quem só preenche o formulário do dia a dia (líder/funcionário/
 *   supervisor que ocupam o próprio cargo) — atribuir QUEM ocupa cada cargo é uma decisão de
 *   configuração da loja, não uma ação operacional do dia a dia, então merece um critério mais
 *   restrito que "preencher o fechamento".
 * - `hasModulePermission(..., "canEdit", cargo.key)` (a subcategoria POR CARGO, ex.
 *   "fechamento-dia:gerencia"): hoje, por `prisma/seed.ts` (`fechamentoFlagsForCargo`), só
 *   ADMINISTRADOR tem `canEdit=true` nessa chave — gerente/gestor/supervisor ficam com
 *   `canEdit=false` ali de propósito, porque essa subcategoria representa "quem pode EXECUTAR
 *   (preencher) este formulário específico", não "quem administra o módulo". Usar essa chave aqui
 *   deixaria a atribuição útil só para o administrador, inconsistente com quem já gerencia
 *   Ocorrências/Perguntas do mesmo módulo.
 *
 * Isolamento de loja: usa `assertEmpresaAccess` (não `empresaIdsForContext`/
 * `getActiveEmpresaContext`) para checar se o usuário logado tem acesso à loja DESTE cargo
 * específico — mesmo padrão das duas rotas irmãs que também operam sobre um `cargoId` já
 * conhecido (`cargos/[cargoId]/submissoes`, `cargos/[cargoId]/perguntas`), em vez do padrão usado
 * pelas rotas de LISTAGEM (`status`, `indicadores`, `ocorrencias`) que precisam enumerar vários
 * cargos/lojas de uma vez (inclusive no modo "Grupo Nord").
 *
 * `responsavelId`/`substitutoId` validados como `User` de verdade COM ACESSO A ESTA LOJA
 * (`findUsersWithoutEmpresaAccess`, @/lib/empresa) — mesma validação (achado #177) já aplicada em
 * `PATCH /api/checklist/templates/[id]` para o mesmíssimo par de campos em `ChecklistTemplate`
 * (responsável/substituto também apontam para `User`, nunca para `Employee`/ficha de RH — a leitura
 * de `podeExecutarFechamentoCargo` abaixo não se aplica aqui). Decisão registrada: NÃO replicamos a
 * checagem de "o `Employee` vinculado tem o cargo certo" que `podeExecutarFechamentoCargo`
 * (@/lib/fechamento-server) aplica no momento de ENVIAR o formulário — essa checagem já roda, ao
 * vivo, toda vez que alguém de fato tenta submeter (é ela quem decide se a pessoa pode preencher,
 * independente de estar ou não marcada aqui como "responsável"); exigi-la também na ATRIBUIÇÃO
 * seria redundante como proteção (marcar alguém como "responsável" não dá a essa pessoa nenhum
 * acesso extra — ela ainda precisa passar por `podeExecutarFechamentoCargo` para enviar de verdade)
 * e engessaria cenários legítimos, como designar um substituto que cobre o cargo sem ter uma ficha
 * de RH com o `cargo` exatamente igual ao nome do card (ex. um gestor cobrindo em emergência) — o
 * próprio comentário de `podeExecutarFechamentoCargo` já registra que essa comparação é por
 * igualdade exata de texto, sem normalização, o que tornaria essa segunda checagem frágil demais
 * para um campo que é só atribuição organizacional, não um gate de segurança.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ cargoId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cargoId } = await params;
  const cargo = await prisma.fechamentoCargo.findUnique({ where: { id: cargoId } });
  if (!cargo) {
    return NextResponse.json({ error: "Cargo do Fechamento do Dia não encontrado." }, { status: 404 });
  }

  const temAcessoALoja = await assertEmpresaAccess(session.user.id, session.user.role, cargo.empresaId);
  if (!temAcessoALoja) {
    return NextResponse.json({ error: "Sem acesso a esta loja." }, { status: 403 });
  }

  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar o Fechamento do Dia." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const { responsavelId, substitutoId } = body as { responsavelId?: string | null; substitutoId?: string | null };

  // `undefined` (campo ausente do corpo) = "não mexe nesse campo"; `string`/`null` = valor novo
  // explícito (null = limpar/voltar para "não definido"). Permite ao cliente futuro enviar só
  // `{ responsavelId }` sem precisar reenviar `substitutoId` (e vice-versa) sem risco de apagar o
  // outro campo por omissão.
  const data: { responsavelId?: string | null; substitutoId?: string | null } = {};
  if (responsavelId !== undefined) {
    if (responsavelId !== null && typeof responsavelId !== "string") {
      return NextResponse.json({ error: '"responsavelId" precisa ser um texto ou null.' }, { status: 400 });
    }
    data.responsavelId = responsavelId;
  }
  if (substitutoId !== undefined) {
    if (substitutoId !== null && typeof substitutoId !== "string") {
      return NextResponse.json({ error: '"substitutoId" precisa ser um texto ou null.' }, { status: 400 });
    }
    data.substitutoId = substitutoId;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Informe "responsavelId" e/ou "substitutoId".' }, { status: 400 });
  }

  // Nunca confiamos no id vindo do cliente sem checar se é um `User` de verdade com acesso a ESTA
  // loja — sem isso, qualquer usuário autenticado com `canEdit` podia atribuir a um cargo desta
  // loja um colaborador de qualquer outra loja da rede só informando o id dele no corpo.
  const idsToCheck = [data.responsavelId, data.substitutoId].filter((v): v is string => !!v);
  if (idsToCheck.length > 0) {
    const invalidIds = await findUsersWithoutEmpresaAccess(idsToCheck, cargo.empresaId);
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Responsável/substituto selecionado não tem acesso a esta loja." },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.fechamentoCargo.update({
    where: { id: cargoId },
    data,
    select: {
      id: true,
      key: true,
      nome: true,
      icon: true,
      ordem: true,
      horarioLiberacao: true,
      horarioLimite: true,
      empresa: { select: { id: true, name: true } },
      responsavel: { select: { id: true, name: true } },
      substituto: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ cargo: updated });
}
