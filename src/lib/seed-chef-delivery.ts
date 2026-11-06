import type { FechamentoGravidade, FechamentoTipoResposta, PrismaClient } from "@prisma/client";

/**
 * Catálogo do cargo "Chef Delivery" do Fechamento do Dia (cargo `key: "delivery"` + suas 8
 * `FechamentoPergunta` + as filhas condicionais "Descrição") — extraído de `prisma/seed.ts`
 * (bloco "Fechamento do Dia", Fase 4 Parte 1, mesmo cargo adicionado na tarefa
 * Ocorrências/Chef Delivery/Dashboard) pra ser reaproveitado tanto pelo seed completo quanto pela
 * rota temporária `GET /api/cron/rh/seed-chef-delivery` — ver comentário no topo daquele arquivo
 * pro motivo da rota existir.
 *
 * Mantém texto, tipos, polaridade e categorias/gravidades sugeridas IDÊNTICOS ao bloco
 * `FECHAMENTO_CARGOS` de `prisma/seed.ts` — nada aqui deveria divergir desse arquivo com o tempo;
 * se o catálogo do Chef Delivery mudar, mude os dois juntos (ou extraia de vez o restante dos
 * cargos pra cá, se fizer sentido numa tarefa futura).
 *
 * Nunca cria/atualiza nada de outro cargo (Gerente/Chef de Salão/Chef de Cozinha) — só lê o id da
 * pergunta compartilhada "Anexar foto (opcional)" (já seedada por eles) pra vincular o cargo novo
 * a ela, sem tocar os campos da pergunta em si nem o vínculo dela com os outros 3 cargos.
 */

type FechamentoPerguntaSeed = {
  texto: string;
  tipo: FechamentoTipoResposta;
  obrigatoria?: boolean; // default true
  abreOcorrencia?: boolean;
  inverterPolaridade?: boolean;
  categoriaSugerida?: string; // nome de uma FechamentoCategoria já existente da empresa
  gravidadeSugerida?: FechamentoGravidade;
  valorPaiQueExibe?: "true" | "false";
  filhas?: FechamentoPerguntaSeed[];
};

const CHEF_DELIVERY_CARGO_KEY = "delivery";
const CHEF_DELIVERY_CARGO_NOME = "Chef Delivery";
const CHEF_DELIVERY_CARGO_ICON = "Bike";
const CHEF_DELIVERY_CARGO_ORDEM = 3;

// Categorias usadas pelas perguntas do Chef Delivery — já existem pra toda empresa desde o seed
// original do Fechamento do Dia (a lista completa de 9 categorias, incluindo "Delivery", é
// seedada pra toda empresa desde a Fase 1, bem antes do cargo Chef Delivery existir). O
// create-if-missing abaixo é só rede de segurança (nunca deveria disparar em produção) — mesma
// regra do CLAUDE.md de nunca deixar um valor novo cair em categoria genérica por falta de
// cadastro, aplicada aqui por excesso de cuidado.
const CHEF_DELIVERY_CATEGORIAS_ORDEM: Record<string, number> = { Produto: 2, Delivery: 4 };

const CHEF_DELIVERY_PERGUNTAS: FechamentoPerguntaSeed[] = [
  { texto: "Como foi o movimento hoje?", tipo: "NOTA_1_5" },
  {
    texto: "Os motoboys foram suficientes?",
    tipo: "SIM_NAO",
    abreOcorrencia: true,
    inverterPolaridade: true,
    categoriaSugerida: "Delivery",
    gravidadeSugerida: "ATENCAO",
    filhas: [{ texto: "Descrição", tipo: "TEXTO", obrigatoria: false, valorPaiQueExibe: "false" }],
  },
  {
    texto: "Teve atraso nos pedidos?",
    tipo: "SIM_NAO",
    abreOcorrencia: true,
    categoriaSugerida: "Delivery",
    gravidadeSugerida: "ATENCAO",
    filhas: [{ texto: "Descrição", tipo: "TEXTO", obrigatoria: false }],
  },
  {
    texto: "Teve Cancelamento?",
    tipo: "SIM_NAO",
    abreOcorrencia: true,
    categoriaSugerida: "Delivery",
    gravidadeSugerida: "IMPORTANTE",
    filhas: [{ texto: "Descrição", tipo: "TEXTO", obrigatoria: false }],
  },
  {
    texto: "Teve Algum erro?",
    tipo: "SIM_NAO",
    abreOcorrencia: true,
    categoriaSugerida: "Produto",
    gravidadeSugerida: "ATENCAO",
    filhas: [{ texto: "Descrição", tipo: "TEXTO", obrigatoria: false }],
  },
  {
    texto: "Precisou aumentar o tempo?",
    tipo: "SIM_NAO",
    abreOcorrencia: true,
    categoriaSugerida: "Delivery",
    gravidadeSugerida: "ATENCAO",
    filhas: [{ texto: "Descrição", tipo: "TEXTO", obrigatoria: false }],
  },
  {
    texto: "Precisou fechar a loja?",
    tipo: "SIM_NAO",
    abreOcorrencia: true,
    categoriaSugerida: "Delivery",
    gravidadeSugerida: "CRITICO",
    filhas: [{ texto: "Descrição", tipo: "TEXTO", obrigatoria: false }],
  },
  { texto: "Precisa de troco?", tipo: "SIM_NAO", abreOcorrencia: false },
];

// Pergunta compartilhada pelos 4 cargos (mesma linha de FechamentoPergunta, ligada a cada cargo
// via FechamentoPerguntaCargo, em vez de 4 linhas com o mesmo texto) — já existe pra toda empresa
// que já tinha Gerente/Chef de Salão/Chef de Cozinha seedados. O create abaixo só roda se, por
// algum motivo, a empresa nunca tiver rodado o seed completo do Fechamento do Dia.
const PERGUNTA_COMPARTILHADA_TEXTO = "Anexar foto (opcional)";
const PERGUNTA_COMPARTILHADA_ORDEM = 1000;

const ADMIN_EMAIL = "admin@nordpizza.com";

export type SeedChefDeliveryEmpresaResultado = {
  empresaId: string;
  empresaNome: string;
  cargoJaExistia: boolean;
  perguntasCriadas: number;
  perguntasAtualizadas: number;
  vinculoPerguntaCompartilhadaCriadoAgora: boolean;
};

export type SeedChefDeliveryResultado = {
  empresas: SeedChefDeliveryEmpresaResultado[];
  totalEmpresas: number;
  empresasQueJaTinhamCargo: number;
  empresasQueGanharamCargoAgora: number;
  totalPerguntasCriadas: number;
  totalPerguntasAtualizadas: number;
};

/**
 * Idempotente: pode ser chamada quantas vezes for preciso — perguntas/cargo/vínculos já
 * existentes só são atualizados (nunca duplicados), igual ao comportamento de upsert do
 * `prisma/seed.ts` original.
 */
export async function seedChefDeliveryCargo(prisma: PrismaClient): Promise<SeedChefDeliveryResultado> {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    throw new Error(
      `Usuário ${ADMIN_EMAIL} não encontrado — não dá pra popular o createdById do catálogo do Chef Delivery.`,
    );
  }

  const empresas = await prisma.empresa.findMany();
  const resultadoPorEmpresa: SeedChefDeliveryEmpresaResultado[] = [];

  for (const empresa of empresas) {
    const cargoExistente = await prisma.fechamentoCargo.findUnique({
      where: { empresaId_key: { empresaId: empresa.id, key: CHEF_DELIVERY_CARGO_KEY } },
    });
    const cargoJaExistia = !!cargoExistente;

    const cargo = await prisma.fechamentoCargo.upsert({
      where: { empresaId_key: { empresaId: empresa.id, key: CHEF_DELIVERY_CARGO_KEY } },
      update: { nome: CHEF_DELIVERY_CARGO_NOME, icon: CHEF_DELIVERY_CARGO_ICON, ordem: CHEF_DELIVERY_CARGO_ORDEM },
      create: {
        empresaId: empresa.id,
        key: CHEF_DELIVERY_CARGO_KEY,
        nome: CHEF_DELIVERY_CARGO_NOME,
        icon: CHEF_DELIVERY_CARGO_ICON,
        ordem: CHEF_DELIVERY_CARGO_ORDEM,
        // Mesmo horário padrão usado em prisma/seed.ts pros 4 cargos: libera às 23:35, prazo até
        // a virada do dia (cruza meia-noite), 6x por semana, com folga só às terças.
        horarioLiberacao: "23:35",
        horarioLimite: "00:00",
        terca: false,
        createdById: admin.id,
      },
    });

    const categoriaIdPorNome = new Map<string, string>();
    for (const nome of Object.keys(CHEF_DELIVERY_CATEGORIAS_ORDEM)) {
      const categoriaExistente = await prisma.fechamentoCategoria.findUnique({
        where: { empresaId_nome: { empresaId: empresa.id, nome } },
      });
      const categoria =
        categoriaExistente ??
        (await prisma.fechamentoCategoria.create({
          data: { empresaId: empresa.id, nome, ordem: CHEF_DELIVERY_CATEGORIAS_ORDEM[nome] },
        }));
      categoriaIdPorNome.set(nome, categoria.id);
    }

    let perguntasCriadas = 0;
    let perguntasAtualizadas = 0;
    let ordem = 0;

    const upsertPergunta = async (spec: FechamentoPerguntaSeed, perguntaPaiId?: string): Promise<void> => {
      const currentOrdem = ordem++;
      const camposComuns = {
        tipo: spec.tipo,
        obrigatoria: spec.obrigatoria ?? true,
        ordem: currentOrdem,
        abreOcorrencia: spec.abreOcorrencia ?? false,
        inverterPolaridade: spec.inverterPolaridade ?? false,
        categoriaSugeridaId: spec.categoriaSugerida ? (categoriaIdPorNome.get(spec.categoriaSugerida) ?? null) : null,
        gravidadeSugerida: spec.gravidadeSugerida ?? null,
        perguntaPaiId: perguntaPaiId ?? null,
        valorPaiQueExibe: perguntaPaiId ? (spec.valorPaiQueExibe ?? "true") : null,
      };

      // Idempotência feita a mão (busca por empresa+texto+pai, depois cria ou atualiza), igual
      // ao seed original — ver comentário de `FechamentoPergunta` no schema.prisma pro motivo de
      // não haver `@@unique([empresaId, texto])` (a filha "Descrição" se repete entre pais
      // diferentes dentro do mesmo cargo).
      const existente = await prisma.fechamentoPergunta.findFirst({
        where: { empresaId: empresa.id, texto: spec.texto, perguntaPaiId: perguntaPaiId ?? null },
      });
      const pergunta = existente
        ? await prisma.fechamentoPergunta.update({ where: { id: existente.id }, data: camposComuns })
        : await prisma.fechamentoPergunta.create({
            data: { empresaId: empresa.id, texto: spec.texto, createdById: admin.id, ...camposComuns },
          });

      if (existente) perguntasAtualizadas++;
      else perguntasCriadas++;

      await prisma.fechamentoPerguntaCargo.upsert({
        where: { perguntaId_cargoId: { perguntaId: pergunta.id, cargoId: cargo.id } },
        update: {},
        create: { perguntaId: pergunta.id, cargoId: cargo.id },
      });

      if (spec.filhas) {
        for (const filha of spec.filhas) {
          await upsertPergunta(filha, pergunta.id);
        }
      }
    };

    for (const spec of CHEF_DELIVERY_PERGUNTAS) {
      await upsertPergunta(spec);
    }

    // Vincula o cargo novo à pergunta compartilhada "Anexar foto (opcional)" — sem recriar nem
    // reescrever os campos dela (ela já pertence aos outros 3 cargos, que não são
    // responsabilidade desta função).
    let vinculoPerguntaCompartilhadaCriadoAgora = false;
    const perguntaCompartilhadaExistente = await prisma.fechamentoPergunta.findFirst({
      where: { empresaId: empresa.id, texto: PERGUNTA_COMPARTILHADA_TEXTO, perguntaPaiId: null },
    });
    const perguntaCompartilhada =
      perguntaCompartilhadaExistente ??
      (await prisma.fechamentoPergunta.create({
        data: {
          empresaId: empresa.id,
          texto: PERGUNTA_COMPARTILHADA_TEXTO,
          tipo: "FOTO",
          obrigatoria: false,
          ordem: PERGUNTA_COMPARTILHADA_ORDEM,
          createdById: admin.id,
        },
      }));
    const vinculoExistente = await prisma.fechamentoPerguntaCargo.findUnique({
      where: { perguntaId_cargoId: { perguntaId: perguntaCompartilhada.id, cargoId: cargo.id } },
    });
    if (!vinculoExistente) {
      await prisma.fechamentoPerguntaCargo.create({
        data: { perguntaId: perguntaCompartilhada.id, cargoId: cargo.id },
      });
      vinculoPerguntaCompartilhadaCriadoAgora = true;
    }

    resultadoPorEmpresa.push({
      empresaId: empresa.id,
      empresaNome: empresa.name,
      cargoJaExistia,
      perguntasCriadas,
      perguntasAtualizadas,
      vinculoPerguntaCompartilhadaCriadoAgora,
    });
  }

  return {
    empresas: resultadoPorEmpresa,
    totalEmpresas: resultadoPorEmpresa.length,
    empresasQueJaTinhamCargo: resultadoPorEmpresa.filter((e) => e.cargoJaExistia).length,
    empresasQueGanharamCargoAgora: resultadoPorEmpresa.filter((e) => !e.cargoJaExistia).length,
    totalPerguntasCriadas: resultadoPorEmpresa.reduce((acc, e) => acc + e.perguntasCriadas, 0),
    totalPerguntasAtualizadas: resultadoPorEmpresa.reduce((acc, e) => acc + e.perguntasAtualizadas, 0),
  };
}
