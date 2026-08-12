import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { allDreCategories } from "../src/lib/dre-structure";
import { MODULES, PERMISSION_PROFILES } from "../src/lib/permissions";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  { key: "inicio", name: "Início", icon: "Home", order: 0, contentType: "dashboard", subs: [] },
  {
    key: "vendas",
    name: "Vendas",
    icon: "ShoppingCart",
    order: 1,
    contentType: "vendas",
    subs: [
      { key: "lancamentos", name: "Lançamentos", icon: "ReceiptText" },
      { key: "itens-vendidos", name: "Itens Vendidos (Curva ABC)", icon: "BarChart3" },
      { key: "garcons", name: "Desempenho por Garçom", icon: "Users" },
      { key: "por-hora", name: "Vendas por Hora", icon: "Clock" },
      { key: "periodo", name: "Vendas por Período", icon: "CalendarRange" },
      { key: "pagamento", name: "Forma de Pagamento", icon: "CreditCard" },
      { key: "entrega", name: "Área de Entrega", icon: "MapPin" },
    ],
  },
  {
    key: "marketing",
    name: "Marketing",
    icon: "Megaphone",
    order: 2,
    contentType: "marketing",
    subs: [],
  },
  {
    key: "universidade",
    name: "Universidade Grupo Nord",
    icon: "GraduationCap",
    order: 3,
    contentType: "universidade",
    subs: [],
  },
  {
    key: "metas",
    name: "Metas",
    icon: "Target",
    order: 4,
    contentType: "metas",
    subs: [
      { key: "gerencia", name: "Metas da Gerência", icon: "Briefcase" },
      { key: "salao", name: "Metas do Salão", icon: "Utensils" },
      { key: "cozinha", name: "Metas da Cozinha", icon: "ChefHat" },
      { key: "delivery", name: "Metas do Delivery", icon: "Bike" },
      { key: "marketing", name: "Metas de Marketing", icon: "Megaphone" },
      { key: "administrativo", name: "Metas Administrativas", icon: "FileText" },
      { key: "acumulada", name: "Venda Acumulada", icon: "Trophy" },
    ],
  },
  {
    key: "rh",
    name: "RH",
    icon: "Users",
    order: 5,
    contentType: "rh",
    subs: [
      { key: "colaboradores", name: "Colaboradores", icon: "IdCard" },
      { key: "financeiro", name: "Financeiro", icon: "DollarSign" },
      { key: "ponto-eletronico", name: "Ponto Eletrônico", icon: "Clock" },
      { key: "ocorrencias", name: "Ocorrências", icon: "AlertTriangle" },
      { key: "ferias", name: "Férias", icon: "Palmtree" },
      { key: "uniformes", name: "Uniformes", icon: "Shirt" },
      { key: "documentos", name: "Documentos", icon: "FolderOpen" },
      { key: "dashboard", name: "Dashboard", icon: "LayoutDashboard" },
    ],
  },
  {
    key: "administrativo",
    name: "Administrativo",
    icon: "Building2",
    order: 6,
    contentType: "administrativo",
    subs: [
      { key: "senhas", name: "Senhas", icon: "KeyRound" },
      { key: "cursos", name: "Cursos", icon: "GraduationCap" },
      { key: "cartilhas", name: "Cartilhas", icon: "BookOpen" },
      { key: "logo", name: "Logo", icon: "Image" },
      { key: "arquivos", name: "Arquivos", icon: "FolderOpen" },
    ],
  },
  {
    key: "ficha-tecnica",
    name: "Ficha Técnica",
    icon: "ClipboardList",
    order: 7,
    contentType: "ficha-tecnica",
    subs: [
      { key: "pizzas-salgadas", name: "Pizzas Salgadas", icon: "Pizza" },
      { key: "pizzas-doces", name: "Pizzas Doces", icon: "Pizza" },
      { key: "combos", name: "Combos", icon: "Package" },
      { key: "esfihas-salgadas", name: "Esfihas Salgadas", icon: "Sandwich" },
      { key: "esfihas-doces", name: "Esfihas Doces", icon: "Sandwich" },
      { key: "acompanhamentos", name: "Acompanhamentos", icon: "Soup" },
      { key: "burgers", name: "Burgers", icon: "Beef" },
      { key: "bebidas", name: "Bebidas", icon: "CupSoda" },
      { key: "drinks", name: "Drinks", icon: "Martini" },
      { key: "insumos", name: "Insumos", icon: "Boxes" },
    ],
  },
  {
    key: "financeiro",
    name: "Financeiro",
    icon: "Wallet",
    order: 8,
    contentType: "financeiro",
    subs: [
      { key: "dashboard", name: "Dashboard Financeiro", icon: "LayoutDashboard" },
      { key: "contas-a-pagar", name: "Contas a Pagar", icon: "ArrowUpCircle" },
      { key: "contas-a-receber", name: "Contas a Receber", icon: "ArrowDownCircle" },
      { key: "fluxo-de-caixa", name: "Fluxo de Caixa", icon: "Waves" },
      { key: "caixa-da-empresa", name: "Caixa da Empresa", icon: "Vault" },
      { key: "dre", name: "DRE", icon: "FileBarChart" },
      { key: "categorias-financeiras", name: "Categorias Financeiras", icon: "Tags" },
      { key: "contas-bancarias", name: "Contas Bancárias", icon: "Landmark" },
      { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
    ],
  },
  {
    key: "configuracoes",
    name: "Configurações",
    icon: "Settings",
    order: 9,
    contentType: "configuracoes",
    subs: [],
  },
  { key: "usuarios", name: "Usuários", icon: "UserCog", order: 10, contentType: "usuarios", subs: [] },
  {
    key: "estoque",
    name: "Estoque",
    icon: "Boxes",
    order: 11,
    contentType: "estoque",
    subs: [
      { key: "dashboard", name: "Dashboard", icon: "LayoutDashboard" },
      { key: "movimentacoes", name: "Movimentações", icon: "ArrowRightLeft" },
    ],
  },
  { key: "cmv", name: "CMV", icon: "Percent", order: 12, contentType: "cmv", subs: [] },
  {
    key: "crm",
    name: "CRM",
    icon: "Contact",
    order: 13,
    contentType: "crm",
    subs: [
      { key: "dashboard", name: "Visão Geral", icon: "LayoutDashboard" },
      { key: "clientes", name: "Clientes", icon: "BookUser" },
      { key: "segmentos", name: "Segmentos", icon: "PieChart" },
      { key: "funil", name: "Funil de Clientes", icon: "Filter" },
      { key: "campanhas", name: "Campanhas", icon: "Megaphone" },
      { key: "automacoes", name: "Automações", icon: "Workflow" },
      { key: "fidelidade", name: "Fidelidade", icon: "Gift" },
      { key: "aniversariantes", name: "Aniversariantes", icon: "Cake" },
      { key: "satisfacao", name: "Satisfação / NPS", icon: "Smile" },
      { key: "inteligencia", name: "Inteligência de Cliente", icon: "BrainCircuit" },
      { key: "relatorios", name: "Relatórios", icon: "FileBarChart" },
    ],
  },
];

async function main() {
  console.log("Seeding database...");

  // --- Empresas (Grupo Nord > Nord Pizza, Zarki Sushi) ---
  const nordPizza = await prisma.empresa.upsert({
    where: { key: "nord-pizza" },
    update: {},
    create: { key: "nord-pizza", name: "Nord Pizza & Burger", color: "#2952E3", order: 0 },
  });
  const zarkiSushi = await prisma.empresa.upsert({
    where: { key: "zarki-sushi" },
    update: {},
    create: { key: "zarki-sushi", name: "Zarki Sushi", color: "#e91e63", order: 1 },
  });

  const passwordHash = await bcrypt.hash("Nord@2026", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@nordpizza.com" },
    update: { canViewGrupoNord: true, defaultEmpresaId: nordPizza.id },
    create: {
      name: "Administrador Nord",
      email: "admin@nordpizza.com",
      passwordHash,
      role: "ADMINISTRADOR",
      canViewGrupoNord: true,
      defaultEmpresaId: nordPizza.id,
    },
  });

  const gerentePass = await bcrypt.hash("Gerente@2026", 10);
  const gerente = await prisma.user.upsert({
    where: { email: "gerente@nordpizza.com" },
    update: { defaultEmpresaId: nordPizza.id },
    create: {
      name: "Gerente Nord",
      email: "gerente@nordpizza.com",
      passwordHash: gerentePass,
      role: "GERENTE",
      defaultEmpresaId: nordPizza.id,
    },
  });

  // acesso do admin às duas lojas; gerente só à Nord Pizza
  for (const empresa of [nordPizza, zarkiSushi]) {
    await prisma.userEmpresaAccess.upsert({
      where: { userId_empresaId: { userId: admin.id, empresaId: empresa.id } },
      update: {},
      create: { userId: admin.id, empresaId: empresa.id },
    });
  }
  await prisma.userEmpresaAccess.upsert({
    where: { userId_empresaId: { userId: gerente.id, empresaId: nordPizza.id } },
    update: {},
    create: { userId: gerente.id, empresaId: nordPizza.id },
  });

  for (const cat of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { key: cat.key },
      update: { name: cat.name, icon: cat.icon, order: cat.order, contentType: cat.contentType },
      create: {
        key: cat.key,
        name: cat.name,
        icon: cat.icon,
        order: cat.order,
        contentType: cat.contentType,
        isSystem: true,
      },
    });

    let subOrder = 0;
    for (const sub of cat.subs) {
      await prisma.subcategory.upsert({
        where: { categoryId_key: { categoryId: category.id, key: sub.key } },
        update: { name: sub.name, icon: sub.icon, order: subOrder },
        create: {
          categoryId: category.id,
          key: sub.key,
          name: sub.name,
          icon: sub.icon,
          order: subOrder,
          isSystem: true,
        },
      });
      subOrder++;
    }
  }

  // --- Perfis de permissão ---
  // Todo perfil começa com "Ver" liberado em todos os módulos (para não
  // esconder nada que já era visível hoje) e Criar/Editar/Excluir em branco,
  // exceto o Administrador, que tem acesso total. Ajustável depois na tela
  // de Permissões.
  for (const profile of PERMISSION_PROFILES) {
    const isAdminProfile = profile.key === "administrador";
    const record = await prisma.permissionProfile.upsert({
      where: { key: profile.key },
      update: { name: profile.name },
      create: { key: profile.key, name: profile.name, isSystem: true },
    });
    for (const mod of MODULES) {
      await prisma.modulePermission.upsert({
        where: { profileId_moduleKey: { profileId: record.id, moduleKey: mod.key } },
        update: {},
        create: {
          profileId: record.id,
          moduleKey: mod.key,
          canView: true,
          canCreate: isAdminProfile,
          canEdit: isAdminProfile,
          canDelete: isAdminProfile,
        },
      });
    }
  }

  const roleToProfileKey: Record<string, string> = {
    ADMINISTRADOR: "administrador",
    GESTOR: "gestor",
    GERENTE: "gerente",
    SUPERVISOR: "supervisor",
    COLABORADOR: "funcionario",
  };
  const usersWithoutProfile = await prisma.user.findMany({ where: { permissionProfileId: null } });
  for (const u of usersWithoutProfile) {
    const profileKey = roleToProfileKey[u.role] ?? "funcionario";
    const profile = await prisma.permissionProfile.findUnique({ where: { key: profileKey } });
    if (profile) {
      await prisma.user.update({ where: { id: u.id }, data: { permissionProfileId: profile.id } });
    }
  }

  const today = new Date();

  // --- Vendas: last 30 days, para cada empresa ---
  const existingSales = await prisma.salesEntry.count();
  if (existingSales === 0) {
    for (const [empresa, factor] of [
      [nordPizza, 1],
      [zarkiSushi, 0.75],
    ] as const) {
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const base = (3200 + Math.random() * 1800) * factor;
        const delivery = Math.round(base * 0.55);
        const salao = Math.round(base * 0.45);
        await prisma.salesEntry.create({
          data: {
            empresaId: empresa.id,
            date,
            faturamentoDelivery: delivery,
            faturamentoSalao: salao,
            pedidosDelivery: Math.round(delivery / 65),
            pedidosBalcao: Math.round(Math.random() * 8),
            pedidosSalao: Math.round(salao / 95),
            mesasAtendidas: Math.round(salao / 130),
            taxaServicoValor: Math.round(salao * 0.1),
            metaDiaria: Math.round(4200 * factor),
            createdById: admin.id,
          },
        });
      }
    }
  }

  // --- Marketing: last 6 months, para cada empresa ---
  const existingMkt = await prisma.marketingEntry.count();
  if (existingMkt === 0) {
    for (const empresa of [nordPizza, zarkiSushi]) {
      for (let i = 5; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const invest = 800 + Math.random() * 600;
        const receita = invest * (2.5 + Math.random() * 2);
        const visitas = 2000 + Math.round(Math.random() * 3000);
        const conversoes = Math.round(visitas * (0.02 + Math.random() * 0.03));
        const alcance = 15000 + Math.round(Math.random() * 10000);
        await prisma.marketingEntry.create({
          data: {
            empresaId: empresa.id,
            date,
            investimentoTrafego: Math.round(invest),
            receitaTrafego: Math.round(receita),
            pedidosCampanha: Math.round(conversoes * 0.6),
            visitasSite: visitas,
            conversoes,
            seguidoresInicio: 8000 + i * 120,
            seguidoresFim: 8000 + (i - 1 >= 0 ? (i - 1) * 120 : 720) + 300,
            curtidas: Math.round(alcance * 0.05),
            comentarios: Math.round(alcance * 0.005),
            compartilhamentos: Math.round(alcance * 0.008),
            salvamentos: Math.round(alcance * 0.01),
            alcance,
            impressoes: Math.round(alcance * 1.8),
            createdById: admin.id,
          },
        });
      }
    }
  }

  // --- Metas ---
  const existingGoals = await prisma.goal.count();
  if (existingGoals === 0) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    await prisma.goal.createMany({
      data: [
        {
          empresaId: nordPizza.id,
          name: "Faturamento mensal",
          category: "GERENCIA",
          responsavel: "Gerente Nord",
          indicador: "Faturamento",
          valorMeta: 130000,
          valorRealizado: 78000,
          unidade: "R$",
          startDate: start,
          endDate: end,
          status: "EM_ANDAMENTO",
          bonificacao: "R$ 500,00 para a equipe",
          createdById: admin.id,
        },
        {
          empresaId: nordPizza.id,
          name: "Reduzir tempo de atendimento no salão",
          category: "SALAO",
          responsavel: "Supervisor Salão",
          indicador: "Minutos por mesa",
          valorMeta: 25,
          valorRealizado: 29,
          unidade: "min",
          startDate: start,
          endDate: end,
          status: "EM_RISCO",
          createdById: admin.id,
        },
        {
          empresaId: nordPizza.id,
          name: "Reduzir CMV médio",
          category: "COZINHA",
          responsavel: "Chef de Cozinha",
          indicador: "CMV %",
          valorMeta: 30,
          valorRealizado: 32,
          unidade: "%",
          startDate: start,
          endDate: end,
          status: "EM_ANDAMENTO",
          createdById: admin.id,
        },
        {
          empresaId: nordPizza.id,
          name: "Tempo médio de entrega",
          category: "DELIVERY",
          responsavel: "Coordenador Delivery",
          indicador: "Minutos",
          valorMeta: 35,
          valorRealizado: 33,
          unidade: "min",
          startDate: start,
          endDate: end,
          status: "CONCLUIDA",
          createdById: admin.id,
        },
        {
          empresaId: zarkiSushi.id,
          name: "Faturamento mensal",
          category: "GERENCIA",
          responsavel: "Gerente Zarki",
          indicador: "Faturamento",
          valorMeta: 100000,
          valorRealizado: 61000,
          unidade: "R$",
          startDate: start,
          endDate: end,
          status: "EM_ANDAMENTO",
          createdById: admin.id,
        },
        {
          empresaId: zarkiSushi.id,
          name: "Reduzir CMV médio",
          category: "COZINHA",
          responsavel: "Chef Zarki",
          indicador: "CMV %",
          valorMeta: 35,
          valorRealizado: 37,
          unidade: "%",
          startDate: start,
          endDate: end,
          status: "EM_RISCO",
          createdById: admin.id,
        },
      ],
    });
  }

  // --- RH ---
  const existingEmployees = await prisma.employee.count();
  if (existingEmployees === 0) {
    const employees = await prisma.$transaction([
      prisma.employee.create({
        data: {
          empresaId: nordPizza.id,
          name: "Carlos Silva",
          cargo: "Pizzaiolo",
          setor: "Cozinha",
          admissionDate: new Date(2023, 2, 10),
          status: "ATIVO",
          gestorResponsavel: "Gerente Nord",
        },
      }),
      prisma.employee.create({
        data: {
          empresaId: nordPizza.id,
          name: "Ana Souza",
          cargo: "Atendente",
          setor: "Salão",
          admissionDate: new Date(2024, 5, 3),
          status: "ATIVO",
          gestorResponsavel: "Gerente Nord",
        },
      }),
      prisma.employee.create({
        data: {
          empresaId: nordPizza.id,
          name: "Bruno Costa",
          cargo: "Motoboy",
          setor: "Delivery",
          admissionDate: new Date(2022, 8, 20),
          status: "ATIVO",
          gestorResponsavel: "Gerente Nord",
        },
      }),
      prisma.employee.create({
        data: {
          empresaId: zarkiSushi.id,
          name: "Kenji Tanaka",
          cargo: "Sushiman",
          setor: "Cozinha",
          admissionDate: new Date(2023, 6, 1),
          status: "ATIVO",
          gestorResponsavel: "Gerente Zarki",
        },
      }),
      prisma.employee.create({
        data: {
          empresaId: zarkiSushi.id,
          name: "Larissa Nunes",
          cargo: "Atendente",
          setor: "Salão",
          admissionDate: new Date(2024, 1, 15),
          status: "ATIVO",
          gestorResponsavel: "Gerente Zarki",
        },
      }),
      prisma.employee.create({
        data: {
          empresaId: nordPizza.id,
          name: "João Pereira",
          cargo: "Garçom",
          setor: "Salão",
          admissionDate: new Date(2022, 3, 5),
          status: "ATIVO",
          gestorResponsavel: "Gerente Nord",
        },
      }),
      prisma.employee.create({
        data: {
          empresaId: nordPizza.id,
          name: "Pedro Lima",
          cargo: "Garçom",
          setor: "Salão",
          admissionDate: new Date(2023, 7, 18),
          status: "ATIVO",
          gestorResponsavel: "Gerente Nord",
        },
      }),
      prisma.employee.create({
        data: {
          empresaId: nordPizza.id,
          name: "Carlos Rocha",
          cargo: "Garçom",
          setor: "Salão",
          admissionDate: new Date(2024, 0, 9),
          status: "ATIVO",
          gestorResponsavel: "Gerente Nord",
        },
      }),
    ]);

    await prisma.occurrence.create({
      data: {
        employeeId: employees[1].id,
        date: new Date(today.getFullYear(), today.getMonth(), 5),
        type: "ATRASO",
        horarioPrevisto: "17:00",
        horarioRealizado: "17:20",
        minutosAtraso: 20,
        status: "JUSTIFICADA",
        justificativa: "Trânsito",
        createdById: admin.id,
      },
    });
    await prisma.occurrence.create({
      data: {
        employeeId: employees[0].id,
        date: new Date(today.getFullYear(), today.getMonth(), 12),
        type: "FALTA",
        status: "NAO_JUSTIFICADA",
        createdById: admin.id,
      },
    });

    const joao = employees[5];
    const pedro = employees[6];
    const carlos = employees[7];
    await prisma.waiterSaleEntry.createMany({
      data: [
        { employeeId: joao.id, empresaId: nordPizza.id, amount: 285320, date: new Date(2025, 5, 30), createdById: admin.id },
        { employeeId: joao.id, empresaId: nordPizza.id, amount: 200000, date: new Date(today.getFullYear(), today.getMonth(), 1), createdById: admin.id },
        { employeeId: pedro.id, empresaId: nordPizza.id, amount: 410250, date: new Date(today.getFullYear(), today.getMonth(), 1), createdById: admin.id },
        { employeeId: carlos.id, empresaId: nordPizza.id, amount: 325600, date: new Date(today.getFullYear(), today.getMonth(), 1), createdById: admin.id },
      ],
    });
  }

  // --- Ficha técnica: insumos + produto exemplo (Nord Pizza) ---
  const existingIngredients = await prisma.ingredient.count();
  if (existingIngredients === 0) {
    const massa = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Farinha de Trigo",
        fornecedor: "Moinho Sul",
        unidade: "kg",
        precoAtual: 5.2,
        quantidadeEmbalagem: 25,
        estoqueMinimo: 20,
        estoqueAtual: 80,
      },
    });
    const mussarela = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Mussarela",
        fornecedor: "Laticínios Nord",
        unidade: "kg",
        precoAtual: 32.9,
        quantidadeEmbalagem: 5,
        estoqueMinimo: 10,
        estoqueAtual: 18,
      },
    });
    const molho = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Molho de Tomate",
        fornecedor: "Hortifruti Central",
        unidade: "kg",
        precoAtual: 8.5,
        quantidadeEmbalagem: 5,
        estoqueMinimo: 8,
        estoqueAtual: 15,
      },
    });

    await prisma.product.create({
      data: {
        empresaId: nordPizza.id,
        name: "Pizza Mussarela",
        code: "PZ-001",
        category: "PIZZA_SALGADA",
        rendimento: "8 fatias",
        tamanho: "Grande (35cm)",
        precoVenda: 55,
        tempoPreparo: 25,
        responsavel: "Chef de Cozinha",
        createdById: admin.id,
        ingredients: {
          create: [
            { ingredientId: massa.id, quantidadeUsada: 0.4, percentualPerda: 3 },
            { ingredientId: mussarela.id, quantidadeUsada: 0.3, percentualPerda: 2 },
            { ingredientId: molho.id, quantidadeUsada: 0.15, percentualPerda: 1 },
          ],
        },
      },
    });

    // --- Ficha técnica: insumos + produto exemplo (Zarki Sushi) ---
    const salmao = await prisma.ingredient.create({
      data: {
        empresaId: zarkiSushi.id,
        name: "Salmão Fresco",
        fornecedor: "Salmão Brasil",
        unidade: "kg",
        precoAtual: 68,
        quantidadeEmbalagem: 1,
        estoqueMinimo: 5,
        estoqueAtual: 12,
      },
    });
    const arroz = await prisma.ingredient.create({
      data: {
        empresaId: zarkiSushi.id,
        name: "Arroz para Sushi",
        fornecedor: "Distribuidora Oriental",
        unidade: "kg",
        precoAtual: 12,
        quantidadeEmbalagem: 5,
        estoqueMinimo: 10,
        estoqueAtual: 25,
      },
    });
    const nori = await prisma.ingredient.create({
      data: {
        empresaId: zarkiSushi.id,
        name: "Alga Nori",
        fornecedor: "Distribuidora Oriental",
        unidade: "un",
        precoAtual: 1.8,
        quantidadeEmbalagem: 50,
        estoqueMinimo: 30,
        estoqueAtual: 90,
      },
    });

    await prisma.product.create({
      data: {
        empresaId: zarkiSushi.id,
        name: "Combo Salmão 20 peças",
        code: "SK-001",
        category: "COMBO",
        rendimento: "20 peças",
        precoVenda: 89,
        tempoPreparo: 20,
        responsavel: "Chef Zarki",
        createdById: admin.id,
        ingredients: {
          create: [
            { ingredientId: salmao.id, quantidadeUsada: 0.3, percentualPerda: 5 },
            { ingredientId: arroz.id, quantidadeUsada: 0.4, percentualPerda: 2 },
            { ingredientId: nori.id, quantidadeUsada: 10, percentualPerda: 0 },
          ],
        },
      },
    });
  }

  // --- Financeiro: categorias (vinculadas à DRE, compartilhadas — mesmo plano de contas) ---
  const dreCategoryTypeMap: Record<string, "RECEITA" | "DESPESA" | "CUSTO" | "INVESTIMENTO"> = {
    faturamentos: "RECEITA",
    "receitas-nao-operacionais": "RECEITA",
    "custos-vendas": "CUSTO",
    cmv: "CUSTO",
    embalagens: "CUSTO",
    investimentos: "INVESTIMENTO",
  };
  for (const cat of allDreCategories()) {
    const type = dreCategoryTypeMap[cat.groupKey] ?? "DESPESA";
    await prisma.financialCategory.upsert({
      where: { name: cat.name },
      update: { dreKey: cat.key, type },
      create: { name: cat.name, dreKey: cat.key, type },
    });
  }

  // --- Financeiro: contas bancárias (uma por empresa) ---
  const existingAccounts = await prisma.bankAccount.count();
  if (existingAccounts === 0) {
    await prisma.bankAccount.createMany({
      data: [
        { empresaId: nordPizza.id, name: "Banco Inter", bank: "Inter", tipo: "Conta Corrente", color: "#f97316", icon: "Landmark" },
        { empresaId: nordPizza.id, name: "Mercado Pago", bank: "Mercado Pago", tipo: "Conta Digital", color: "#2952E3", icon: "Wallet" },
        { empresaId: nordPizza.id, name: "Caixa Físico", bank: null, tipo: "Caixa", color: "#22c55e", icon: "Banknote" },
        { empresaId: zarkiSushi.id, name: "Nubank", bank: "Nubank", tipo: "Conta Corrente", color: "#a855f7", icon: "Landmark" },
        { empresaId: zarkiSushi.id, name: "Caixa Físico", bank: null, tipo: "Caixa", color: "#22c55e", icon: "Banknote" },
      ],
    });
  }

  console.log("Seed concluído.");
  console.log("Login admin: admin@nordpizza.com / Nord@2026 (acesso Nord Pizza + Zarki Sushi + Grupo Nord)");
  console.log(`Login gerente: ${gerente.email} / Gerente@2026 (acesso apenas Nord Pizza)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
