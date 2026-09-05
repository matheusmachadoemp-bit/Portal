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
      { key: "faturamento", name: "Faturamento", icon: "DollarSign" },
      { key: "acompanhamento-vendas", name: "Acompanhamento de Vendas", icon: "GitCompare" },
      { key: "itens-vendidos", name: "Itens Vendidos (Curva ABC)", icon: "BarChart3" },
      { key: "garcons", name: "Desempenho por Garçom", icon: "Users" },
    ],
  },
  {
    key: "marketing",
    name: "Marketing",
    icon: "Megaphone",
    order: 2,
    contentType: "marketing",
    subs: [
      { key: "dashboard", name: "Dashboard", icon: "LayoutDashboard" },
      { key: "calendario", name: "Calendário de Conteúdo", icon: "Calendar" },
      { key: "tarefas", name: "Tarefas", icon: "ListChecks" },
      { key: "campanhas", name: "Campanhas", icon: "Megaphone" },
      { key: "parcerias", name: "Parcerias", icon: "Handshake" },
      { key: "biblioteca", name: "Biblioteca de Arquivos", icon: "FolderOpen" },
      { key: "ideias", name: "Banco de Ideias", icon: "Lightbulb" },
      { key: "trafego-pago", name: "Tráfego Pago", icon: "TrendingUp" },
      { key: "redes-sociais", name: "Redes Sociais", icon: "Share2" },
      { key: "equipe", name: "Equipe", icon: "Users" },
      { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
    ],
  },
  {
    key: "universidade",
    name: "Universidade Grupo Nord",
    icon: "GraduationCap",
    order: 3,
    contentType: "universidade",
    subs: [
      { key: "dashboard", name: "Dashboard", icon: "LayoutDashboard" },
      { key: "trilhas", name: "Trilhas de Aprendizagem", icon: "Route" },
      { key: "cursos", name: "Cursos", icon: "BookOpen" },
      { key: "videoaulas", name: "Videoaulas", icon: "Video" },
      { key: "avaliacoes", name: "Avaliações", icon: "ClipboardCheck" },
      { key: "certificados", name: "Certificados", icon: "Award" },
      { key: "colaboradores", name: "Colaboradores", icon: "Users" },
      { key: "ranking", name: "Ranking", icon: "Trophy" },
      { key: "biblioteca", name: "Biblioteca", icon: "Library" },
      { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
      { key: "gestor", name: "Painel do Gestor", icon: "Briefcase" },
    ],
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
      { key: "pesquisa-satisfacao", name: "Pesquisa de Satisfação", icon: "Smile" },
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
      { key: "conciliacao-bancaria", name: "Conciliação Bancária", icon: "ListChecks" },
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
      { key: "dashboard", name: "Visão Geral", icon: "LayoutDashboard" },
      { key: "contagem-semanal", name: "Contagem Semanal", icon: "ClipboardCheck" },
      { key: "contagem-mensal", name: "Contagem Mensal", icon: "CalendarCheck2" },
      { key: "historico-contagens", name: "Histórico de Contagens", icon: "History" },
      { key: "produtos", name: "Produtos", icon: "Package" },
      { key: "categorias", name: "Categorias", icon: "Tags" },
      { key: "compras", name: "Compras", icon: "ShoppingBasket" },
      { key: "fornecedores", name: "Fornecedores", icon: "Truck" },
      { key: "recebimento", name: "Recebimento de Mercadorias", icon: "PackageCheck" },
      { key: "movimentacoes", name: "Movimentações", icon: "ArrowRightLeft" },
      { key: "transferencias", name: "Transferências", icon: "Shuffle" },
      { key: "perdas", name: "Perdas e Desperdícios", icon: "TriangleAlert" },
      { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
      { key: "configuracoes", name: "Configurações", icon: "Settings" },
    ],
  },
  {
    key: "cmv",
    name: "CMV",
    icon: "Percent",
    order: 12,
    contentType: "cmv",
    subs: [
      { key: "cmv-teorico", name: "CMV Teórico", icon: "Calculator" },
      { key: "cmv-real", name: "CMV Real", icon: "Warehouse" },
      { key: "comparativo", name: "Comparativo Real x Teórico", icon: "GitCompareArrows" },
    ],
  },
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
  {
    key: "reuniao",
    name: "Reunião",
    icon: "Presentation",
    order: 14,
    contentType: "reuniao",
    subs: [
      { key: "salao", name: "Reunião Salão", icon: "Utensils" },
      { key: "delivery", name: "Reunião Delivery", icon: "Truck" },
      { key: "cozinha", name: "Reunião Cozinha", icon: "ChefHat" },
      { key: "gerente", name: "Reunião Gerente", icon: "Briefcase" },
      { key: "lideranca", name: "Reunião Liderança", icon: "Crown" },
    ],
  },
  {
    key: "tarefas",
    name: "Tarefas",
    icon: "ListChecks",
    order: 15,
    contentType: "tarefas",
    subs: [{ key: "checklist", name: "Checklist", icon: "ClipboardCheck" }],
  },
  {
    key: "manutencao",
    name: "Manutenção",
    icon: "Wrench",
    order: 16,
    contentType: "manutencao",
    subs: [
      { key: "visao-geral", name: "Visão geral", icon: "LayoutDashboard" },
      { key: "chamados", name: "Chamados", icon: "ClipboardList" },
      { key: "equipamentos", name: "Equipamentos", icon: "Boxes" },
      { key: "calendario", name: "Calendário preventivo", icon: "CalendarClock" },
      { key: "prestadores", name: "Prestadores", icon: "Users" },
      { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
      { key: "configuracoes", name: "Configurações", icon: "Settings" },
    ],
  },
  {
    key: "loja-nord",
    name: "Loja Nord",
    icon: "Gift",
    order: 17,
    contentType: "loja-nord",
    subs: [
      { key: "loja", name: "Loja", icon: "ShoppingBag" },
      { key: "meus-pontos", name: "Meus Pontos", icon: "Coins" },
      { key: "ranking", name: "Ranking", icon: "Trophy" },
      { key: "meus-resgates", name: "Meus Resgates", icon: "PackageCheck" },
      { key: "gestao", name: "Gestão", icon: "Settings" },
      { key: "regras", name: "Regras de Pontuação", icon: "BookOpen" },
    ],
  },
];

async function main() {
  console.log("Seeding database...");

  // --- Empresas (Grupo Nord > Nord Pizza, Zarki Sushi) ---
  const nordPizza = await prisma.empresa.upsert({
    where: { key: "nord-pizza" },
    update: { metaCmvPercent: 30 },
    create: { key: "nord-pizza", name: "Nord Pizza & Burger", color: "#2952E3", order: 0, metaCmvPercent: 30 },
  });
  const zarkiSushi = await prisma.empresa.upsert({
    where: { key: "zarki-sushi" },
    update: { metaCmvPercent: 37 },
    create: { key: "zarki-sushi", name: "Zarki Sushi", color: "#e91e63", order: 1, metaCmvPercent: 37 },
  });

  const passwordHash = await bcrypt.hash("Nord@2026", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@nordpizza.com" },
    update: { passwordHash, canViewGrupoNord: true, defaultEmpresaId: nordPizza.id },
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
    update: { passwordHash: gerentePass, defaultEmpresaId: nordPizza.id },
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

  // --- Estoque: categorias de produto (compartilhadas entre lojas) ---
  const STOCK_CATEGORIES = [
    { key: "carnes", name: "Carnes", color: "#ef4444", icon: "Beef", setor: "Câmara fria", metaPerdaPercent: 2, periodicidadeContagem: "SEMANAL" },
    { key: "pescados", name: "Pescados", color: "#0ea5e9", icon: "Fish", setor: "Sushibar", metaPerdaPercent: 3, periodicidadeContagem: "SEMANAL" },
    { key: "frios", name: "Frios", color: "#f97316", icon: "Sandwich", setor: "Câmara fria", metaPerdaPercent: 2, periodicidadeContagem: "SEMANAL" },
    { key: "laticinios", name: "Laticínios", color: "#eab308", icon: "Milk", setor: "Câmara fria", metaPerdaPercent: 2, periodicidadeContagem: "SEMANAL" },
    { key: "hortifruti", name: "Hortifruti", color: "#22c55e", icon: "Carrot", setor: "Câmara fria", metaPerdaPercent: 4, periodicidadeContagem: "SEMANAL" },
    { key: "congelados", name: "Congelados", color: "#38bdf8", icon: "Snowflake", setor: "Freezer", metaPerdaPercent: 1.5, periodicidadeContagem: "SEMANAL" },
    { key: "massas-graos", name: "Massas e Grãos", color: "#f59e0b", icon: "Wheat", setor: "Estoque seco", metaPerdaPercent: 1, periodicidadeContagem: "MENSAL" },
    { key: "molhos-temperos", name: "Molhos e Temperos", color: "#dc2626", icon: "Soup", setor: "Estoque seco", metaPerdaPercent: 1.5, periodicidadeContagem: "MENSAL" },
    { key: "orientais", name: "Insumos Orientais", color: "#a855f7", icon: "UtensilsCrossed", setor: "Sushibar", metaPerdaPercent: 2, periodicidadeContagem: "SEMANAL" },
    { key: "bebidas", name: "Bebidas", color: "#2952E3", icon: "CupSoda", setor: "Bar e bebidas", metaPerdaPercent: 1, periodicidadeContagem: "MENSAL" },
    { key: "embalagens", name: "Embalagens", color: "#64748b", icon: "Package", setor: "Delivery e embalagens", metaPerdaPercent: 1, periodicidadeContagem: "MENSAL" },
    { key: "limpeza", name: "Produtos de Limpeza", color: "#06b6d4", icon: "SprayCan", setor: "Estoque seco", metaPerdaPercent: 1, periodicidadeContagem: "MENSAL" },
  ];
  const stockCategoryByKey = new Map<string, Awaited<ReturnType<typeof prisma.stockCategory.upsert>>>();
  for (const [idx, cat] of STOCK_CATEGORIES.entries()) {
    const record = await prisma.stockCategory.upsert({
      where: { key: cat.key },
      update: { name: cat.name, color: cat.color, icon: cat.icon, setor: cat.setor, metaPerdaPercent: cat.metaPerdaPercent, periodicidadeContagem: cat.periodicidadeContagem, order: idx },
      create: { ...cat, order: idx },
    });
    stockCategoryByKey.set(cat.key, record);
  }

  // --- Ficha técnica + Estoque: insumos, fornecedores, produto exemplo (Nord Pizza) ---
  const existingIngredients = await prisma.ingredient.count();
  if (existingIngredients === 0) {
    const [moinhoSul, laticiniosNord, hortifrutiCentral, distribuidoraBebidas, embalagensExpress] = await Promise.all([
      prisma.supplier.create({ data: { empresaId: nordPizza.id, razaoSocial: "Moinho Sul Alimentos Ltda", nomeFantasia: "Moinho Sul", cnpj: "12.345.678/0001-90", telefone: "(11) 4002-8900", whatsapp: "(11) 94002-8900", email: "vendas@moinhosul.com.br", endereco: "Rod. Anhanguera, km 32 — Cajamar/SP", prazoPagamentoDias: 30, prazoEntregaDias: 2, pedidoMinimo: 500, avaliacao: 4.5 } }),
      prisma.supplier.create({ data: { empresaId: nordPizza.id, razaoSocial: "Laticínios Nord Distribuidora Ltda", nomeFantasia: "Laticínios Nord", cnpj: "23.456.789/0001-01", telefone: "(11) 3345-7700", whatsapp: "(11) 93345-7700", email: "comercial@laticiniosnord.com.br", endereco: "Av. dos Laticínios, 450 — São Paulo/SP", prazoPagamentoDias: 15, prazoEntregaDias: 1, pedidoMinimo: 300, avaliacao: 4.2 } }),
      prisma.supplier.create({ data: { empresaId: nordPizza.id, razaoSocial: "Hortifruti Central Comércio Ltda", nomeFantasia: "Hortifruti Central", cnpj: "34.567.890/0001-12", telefone: "(11) 3221-5500", email: "pedidos@hortifruticentral.com.br", endereco: "CEAGESP, Box 112 — São Paulo/SP", prazoPagamentoDias: 7, prazoEntregaDias: 1, pedidoMinimo: 150, avaliacao: 3.8 } }),
      prisma.supplier.create({ data: { empresaId: nordPizza.id, razaoSocial: "Distribuidora de Bebidas SP Ltda", nomeFantasia: "Bebidas SP", cnpj: "45.678.901/0001-23", telefone: "(11) 3556-9900", email: "vendas@bebidassp.com.br", endereco: "Rua das Bebidas, 780 — São Paulo/SP", prazoPagamentoDias: 30, prazoEntregaDias: 3, pedidoMinimo: 800, avaliacao: 4.6 } }),
      prisma.supplier.create({ data: { empresaId: nordPizza.id, razaoSocial: "Embalagens Express Ltda", nomeFantasia: "Embalagens Express", cnpj: "56.789.012/0001-34", telefone: "(11) 3778-4400", email: "comercial@embalagensexpress.com.br", endereco: "Distrito Industrial, 220 — Guarulhos/SP", prazoPagamentoDias: 30, prazoEntregaDias: 5, pedidoMinimo: 400, avaliacao: 4.0 } }),
    ]);

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
        categoryId: stockCategoryByKey.get("massas-graos")!.id,
        setor: "Estoque seco",
        codigoInterno: "ND-001",
        codigoBarras: "7891000100103",
        localArmazenamento: "Prateleira A1",
        unidadeCompra: "Saco 25kg",
        fatorConversao: 25,
        pesoEmbalagem: 25,
        rendimentoAproveitavel: 100,
        estoqueMaximo: 200,
        pontoReposicao: 40,
        fornecedorPrincipalId: moinhoSul.id,
        perecivel: false,
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
        categoryId: stockCategoryByKey.get("laticinios")!.id,
        setor: "Câmara fria",
        codigoInterno: "ND-002",
        codigoBarras: "7891000100202",
        localArmazenamento: "Câmara 1 — Prateleira B2",
        unidadeCompra: "Peça 5kg",
        fatorConversao: 5,
        pesoEmbalagem: 5,
        rendimentoAproveitavel: 97,
        estoqueMaximo: 60,
        pontoReposicao: 15,
        fornecedorPrincipalId: laticiniosNord.id,
        perecivel: true,
        validade: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5),
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
        categoryId: stockCategoryByKey.get("molhos-temperos")!.id,
        setor: "Estoque seco",
        codigoInterno: "ND-003",
        localArmazenamento: "Prateleira A3",
        unidadeCompra: "Balde 5kg",
        fatorConversao: 5,
        estoqueMaximo: 60,
        pontoReposicao: 12,
        fornecedorPrincipalId: hortifrutiCentral.id,
        perecivel: true,
      },
    });
    const presunto = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Presunto Fatiado",
        fornecedor: "Laticínios Nord",
        unidade: "kg",
        precoAtual: 24.5,
        quantidadeEmbalagem: 3,
        estoqueMinimo: 6,
        estoqueAtual: 9,
        categoryId: stockCategoryByKey.get("frios")!.id,
        setor: "Câmara fria",
        codigoInterno: "ND-004",
        localArmazenamento: "Câmara 1 — Prateleira B3",
        unidadeCompra: "Peça 3kg",
        fatorConversao: 3,
        estoqueMaximo: 30,
        pontoReposicao: 8,
        fornecedorPrincipalId: laticiniosNord.id,
        perecivel: true,
      },
    });
    const carneHamburguer = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Carne para Hambúrguer 160g",
        fornecedor: "Moinho Sul",
        unidade: "un",
        precoAtual: 6.8,
        quantidadeEmbalagem: 20,
        estoqueMinimo: 60,
        estoqueAtual: 32,
        categoryId: stockCategoryByKey.get("carnes")!.id,
        setor: "Freezer",
        codigoInterno: "ND-005",
        localArmazenamento: "Freezer 2 — Gaveta 1",
        unidadeCompra: "Caixa 20un",
        fatorConversao: 20,
        estoqueMaximo: 200,
        pontoReposicao: 80,
        fornecedorPrincipalId: moinhoSul.id,
        perecivel: true,
      },
    });
    const paoHamburguer = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Pão de Hambúrguer",
        fornecedor: "Moinho Sul",
        unidade: "un",
        precoAtual: 1.9,
        quantidadeEmbalagem: 12,
        estoqueMinimo: 48,
        estoqueAtual: 96,
        categoryId: stockCategoryByKey.get("massas-graos")!.id,
        setor: "Estoque seco",
        codigoInterno: "ND-006",
        localArmazenamento: "Prateleira A2",
        unidadeCompra: "Pacote 12un",
        fatorConversao: 12,
        estoqueMaximo: 240,
        pontoReposicao: 60,
        fornecedorPrincipalId: moinhoSul.id,
        perecivel: true,
      },
    });
    const batataCongelada = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Batata Congelada Pré-Frita",
        fornecedor: "Hortifruti Central",
        unidade: "kg",
        precoAtual: 9.9,
        quantidadeEmbalagem: 2.5,
        estoqueMinimo: 15,
        estoqueAtual: 22,
        categoryId: stockCategoryByKey.get("congelados")!.id,
        setor: "Freezer",
        codigoInterno: "ND-007",
        localArmazenamento: "Freezer 1 — Gaveta 3",
        unidadeCompra: "Pacote 2,5kg",
        fatorConversao: 2.5,
        estoqueMaximo: 80,
        pontoReposicao: 20,
        fornecedorPrincipalId: hortifrutiCentral.id,
        perecivel: true,
      },
    });
    const refrigerante = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Refrigerante Lata 350ml",
        fornecedor: "Bebidas SP",
        unidade: "un",
        precoAtual: 3.4,
        quantidadeEmbalagem: 24,
        estoqueMinimo: 96,
        estoqueAtual: 240,
        categoryId: stockCategoryByKey.get("bebidas")!.id,
        setor: "Bar e bebidas",
        codigoInterno: "ND-008",
        localArmazenamento: "Estoque de bebidas — Prateleira C1",
        unidadeCompra: "Fardo 24un",
        fatorConversao: 24,
        estoqueMaximo: 480,
        pontoReposicao: 120,
        fornecedorPrincipalId: distribuidoraBebidas.id,
        perecivel: false,
      },
    });
    const caixaPizza = await prisma.ingredient.create({
      data: {
        empresaId: nordPizza.id,
        name: "Caixa de Pizza G (35cm)",
        fornecedor: "Embalagens Express",
        unidade: "un",
        precoAtual: 1.6,
        quantidadeEmbalagem: 50,
        estoqueMinimo: 150,
        estoqueAtual: 400,
        categoryId: stockCategoryByKey.get("embalagens")!.id,
        setor: "Delivery e embalagens",
        codigoInterno: "ND-009",
        localArmazenamento: "Depósito de embalagens",
        unidadeCompra: "Fardo 50un",
        fatorConversao: 50,
        estoqueMaximo: 1000,
        pontoReposicao: 200,
        fornecedorPrincipalId: embalagensExpress.id,
        perecivel: false,
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
    await prisma.product.create({
      data: {
        empresaId: nordPizza.id,
        name: "Burger Clássico Nord",
        code: "BG-001",
        category: "BURGER",
        rendimento: "1 unidade",
        precoVenda: 32,
        tempoPreparo: 15,
        responsavel: "Chef de Cozinha",
        createdById: admin.id,
        ingredients: {
          create: [
            { ingredientId: carneHamburguer.id, quantidadeUsada: 1, percentualPerda: 2 },
            { ingredientId: paoHamburguer.id, quantidadeUsada: 1, percentualPerda: 1 },
            { ingredientId: presunto.id, quantidadeUsada: 0.05, percentualPerda: 2 },
          ],
        },
      },
    });

    // --- Ficha técnica + Estoque: insumos, fornecedores, produto exemplo (Zarki Sushi) ---
    const [salmaoBrasil, distribuidoraOriental, embalagensOrientais] = await Promise.all([
      prisma.supplier.create({ data: { empresaId: zarkiSushi.id, razaoSocial: "Salmão Brasil Importadora Ltda", nomeFantasia: "Salmão Brasil", cnpj: "67.890.123/0001-45", telefone: "(11) 3667-2200", whatsapp: "(11) 93667-2200", email: "vendas@salmaobrasil.com.br", endereco: "Terminal Frigorificado, Box 8 — Guarulhos/SP", prazoPagamentoDias: 15, prazoEntregaDias: 2, pedidoMinimo: 600, avaliacao: 4.7 } }),
      prisma.supplier.create({ data: { empresaId: zarkiSushi.id, razaoSocial: "Distribuidora Oriental Alimentos Ltda", nomeFantasia: "Distribuidora Oriental", cnpj: "78.901.234/0001-56", telefone: "(11) 3229-8800", email: "comercial@distoriental.com.br", endereco: "Rua da Liberdade, 900 — São Paulo/SP", prazoPagamentoDias: 21, prazoEntregaDias: 2, pedidoMinimo: 350, avaliacao: 4.3 } }),
      prisma.supplier.create({ data: { empresaId: zarkiSushi.id, razaoSocial: "Embalagens Orientais Design Ltda", nomeFantasia: "Embalagens Orientais", cnpj: "89.012.345/0001-67", telefone: "(11) 3990-1100", email: "pedidos@embalagensorientais.com.br", endereco: "Av. Industrial, 340 — São Paulo/SP", prazoPagamentoDias: 30, prazoEntregaDias: 4, pedidoMinimo: 300, avaliacao: 3.9 } }),
    ]);

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
        categoryId: stockCategoryByKey.get("pescados")!.id,
        setor: "Sushibar",
        codigoInterno: "ZK-001",
        codigoBarras: "7892000200101",
        localArmazenamento: "Câmara fria — Prateleira 1",
        unidadeCompra: "kg",
        fatorConversao: 1,
        rendimentoAproveitavel: 85,
        estoqueMaximo: 40,
        pontoReposicao: 8,
        fornecedorPrincipalId: salmaoBrasil.id,
        perecivel: true,
        validade: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3),
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
        categoryId: stockCategoryByKey.get("massas-graos")!.id,
        setor: "Estoque seco",
        codigoInterno: "ZK-002",
        localArmazenamento: "Estoque seco — Prateleira 2",
        unidadeCompra: "Saco 5kg",
        fatorConversao: 5,
        estoqueMaximo: 80,
        pontoReposicao: 15,
        fornecedorPrincipalId: distribuidoraOriental.id,
        perecivel: false,
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
        categoryId: stockCategoryByKey.get("orientais")!.id,
        setor: "Sushibar",
        codigoInterno: "ZK-003",
        localArmazenamento: "Estoque seco — Prateleira 3",
        unidadeCompra: "Pacote 50un",
        fatorConversao: 50,
        estoqueMaximo: 300,
        pontoReposicao: 60,
        fornecedorPrincipalId: distribuidoraOriental.id,
        perecivel: false,
      },
    });
    const creamCheese = await prisma.ingredient.create({
      data: {
        empresaId: zarkiSushi.id,
        name: "Cream Cheese",
        fornecedor: "Distribuidora Oriental",
        unidade: "kg",
        precoAtual: 28,
        quantidadeEmbalagem: 2,
        estoqueMinimo: 6,
        estoqueAtual: 4,
        categoryId: stockCategoryByKey.get("laticinios")!.id,
        setor: "Câmara fria",
        codigoInterno: "ZK-004",
        localArmazenamento: "Câmara fria — Prateleira 2",
        unidadeCompra: "Balde 2kg",
        fatorConversao: 2,
        estoqueMaximo: 30,
        pontoReposicao: 8,
        fornecedorPrincipalId: distribuidoraOriental.id,
        perecivel: true,
      },
    });
    const shoyu = await prisma.ingredient.create({
      data: {
        empresaId: zarkiSushi.id,
        name: "Molho Shoyu",
        fornecedor: "Distribuidora Oriental",
        unidade: "l",
        precoAtual: 14,
        quantidadeEmbalagem: 5,
        estoqueMinimo: 8,
        estoqueAtual: 18,
        categoryId: stockCategoryByKey.get("orientais")!.id,
        setor: "Estoque seco",
        codigoInterno: "ZK-005",
        localArmazenamento: "Estoque seco — Prateleira 3",
        unidadeCompra: "Galão 5L",
        fatorConversao: 5,
        estoqueMaximo: 60,
        pontoReposicao: 12,
        fornecedorPrincipalId: distribuidoraOriental.id,
        perecivel: false,
      },
    });
    const embalagemSushi = await prisma.ingredient.create({
      data: {
        empresaId: zarkiSushi.id,
        name: "Embalagem Delivery Sushi",
        fornecedor: "Embalagens Orientais",
        unidade: "un",
        precoAtual: 2.1,
        quantidadeEmbalagem: 50,
        estoqueMinimo: 100,
        estoqueAtual: 320,
        categoryId: stockCategoryByKey.get("embalagens")!.id,
        setor: "Delivery e embalagens",
        codigoInterno: "ZK-006",
        localArmazenamento: "Depósito de embalagens",
        unidadeCompra: "Fardo 50un",
        fatorConversao: 50,
        estoqueMaximo: 600,
        pontoReposicao: 150,
        fornecedorPrincipalId: embalagensOrientais.id,
        perecivel: false,
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
    await prisma.product.create({
      data: {
        empresaId: zarkiSushi.id,
        name: "Uramaki Cream Cheese 8 peças",
        code: "SK-002",
        category: "COMBO",
        rendimento: "8 peças",
        precoVenda: 34,
        tempoPreparo: 12,
        responsavel: "Chef Zarki",
        createdById: admin.id,
        ingredients: {
          create: [
            { ingredientId: salmao.id, quantidadeUsada: 0.08, percentualPerda: 5 },
            { ingredientId: arroz.id, quantidadeUsada: 0.15, percentualPerda: 2 },
            { ingredientId: creamCheese.id, quantidadeUsada: 0.05, percentualPerda: 1 },
            { ingredientId: nori.id, quantidadeUsada: 2, percentualPerda: 0 },
          ],
        },
      },
    });

    // --- Estoque: histórico de compras + recebimento (últimas semanas) ---
    async function registrarCompraRecebida(opts: {
      empresaId: string;
      supplierId: string;
      numeroNota: string;
      diasAtras: number;
      itens: { ingredientId: string; quantidade: number; unidade: string; valorUnitario: number }[];
      frete?: number;
      responsavel: string;
    }) {
      const data = new Date(today);
      data.setDate(data.getDate() - opts.diasAtras);
      const purchase = await prisma.purchase.create({
        data: {
          empresaId: opts.empresaId,
          supplierId: opts.supplierId,
          numeroNota: opts.numeroNota,
          data,
          compradorResponsavel: opts.responsavel,
          formaPagamento: "PIX",
          dataVencimento: new Date(data.getTime() + 15 * 86400000),
          frete: opts.frete ?? 0,
          status: "RECEBIDO",
          createdById: admin.id,
          items: {
            create: opts.itens.map((it) => ({
              ingredientId: it.ingredientId,
              quantidade: it.quantidade,
              unidade: it.unidade,
              valorUnitario: it.valorUnitario,
              valorTotal: it.quantidade * it.valorUnitario,
            })),
          },
        },
      });
      await prisma.receiving.create({
        data: {
          purchaseId: purchase.id,
          empresaId: opts.empresaId,
          dataHora: data,
          responsavel: opts.responsavel,
          status: "APROVADO",
          observacao: "Mercadoria conferida sem divergências.",
        },
      });
      for (const it of opts.itens) {
        await prisma.stockMovement.create({
          data: {
            ingredientId: it.ingredientId,
            empresaId: opts.empresaId,
            type: "ENTRADA",
            quantidade: it.quantidade,
            estoqueApos: it.quantidade,
            motivo: `Compra NF ${opts.numeroNota}`,
            origin: "COMPRA",
            origem: opts.numeroNota,
            createdById: admin.id,
            createdAt: data,
          },
        });
      }
      return purchase;
    }

    await registrarCompraRecebida({
      empresaId: nordPizza.id,
      supplierId: moinhoSul.id,
      numeroNota: "NF-88231",
      diasAtras: 6,
      responsavel: "Gerente Nord",
      itens: [
        { ingredientId: massa.id, quantidade: 50, unidade: "kg", valorUnitario: 5.2 },
        { ingredientId: paoHamburguer.id, quantidade: 96, unidade: "un", valorUnitario: 1.9 },
      ],
    });
    await registrarCompraRecebida({
      empresaId: nordPizza.id,
      supplierId: laticiniosNord.id,
      numeroNota: "NF-77120",
      diasAtras: 3,
      responsavel: "Gerente Nord",
      itens: [
        { ingredientId: mussarela.id, quantidade: 15, unidade: "kg", valorUnitario: 33.5 },
        { ingredientId: presunto.id, quantidade: 6, unidade: "kg", valorUnitario: 24.9 },
      ],
    });
    await registrarCompraRecebida({
      empresaId: nordPizza.id,
      supplierId: distribuidoraBebidas.id,
      numeroNota: "NF-56410",
      diasAtras: 10,
      responsavel: "Coordenador Delivery",
      itens: [{ ingredientId: refrigerante.id, quantidade: 120, unidade: "un", valorUnitario: 3.4 }],
    });
    await registrarCompraRecebida({
      empresaId: zarkiSushi.id,
      supplierId: salmaoBrasil.id,
      numeroNota: "NF-33012",
      diasAtras: 2,
      responsavel: "Gerente Zarki",
      itens: [{ ingredientId: salmao.id, quantidade: 20, unidade: "kg", valorUnitario: 69.9 }],
    });
    await registrarCompraRecebida({
      empresaId: zarkiSushi.id,
      supplierId: distribuidoraOriental.id,
      numeroNota: "NF-33099",
      diasAtras: 7,
      responsavel: "Chef Zarki",
      itens: [
        { ingredientId: arroz.id, quantidade: 25, unidade: "kg", valorUnitario: 12 },
        { ingredientId: shoyu.id, quantidade: 15, unidade: "l", valorUnitario: 14 },
      ],
    });

    // um pedido ainda em aberto, para aparecer nas telas de Compras/Recebimento
    await prisma.purchase.create({
      data: {
        empresaId: nordPizza.id,
        supplierId: hortifrutiCentral.id,
        numeroNota: "NF-91004",
        data: new Date(today.getTime() - 1 * 86400000),
        compradorResponsavel: "Gerente Nord",
        formaPagamento: "PIX",
        status: "AGUARDANDO_ENTREGA",
        createdById: admin.id,
        items: {
          create: [
            { ingredientId: batataCongelada.id, quantidade: 30, unidade: "kg", valorUnitario: 9.9, valorTotal: 297 },
            { ingredientId: molho.id, quantidade: 20, unidade: "kg", valorUnitario: 8.9, valorTotal: 178 },
          ],
        },
      },
    });

    // --- Estoque: perdas e desperdícios ---
    const lossData: { empresaId: string; setor: string; ingredientId: string; quantidade: number; unidade: string; valorEstimado: number; motivo: import("@prisma/client").LossReason; responsavel: string; diasAtras: number }[] = [
      { empresaId: nordPizza.id, setor: "Câmara fria", ingredientId: mussarela.id, quantidade: 1.2, unidade: "kg", valorEstimado: 39.5, motivo: "VENCIMENTO", responsavel: "Chef de Cozinha", diasAtras: 4 },
      { empresaId: nordPizza.id, setor: "Pizzaria", ingredientId: massa.id, quantidade: 2, unidade: "kg", valorEstimado: 10.4, motivo: "ERRO_PRODUCAO", responsavel: "Auxiliar de Cozinha", diasAtras: 2 },
      { empresaId: nordPizza.id, setor: "Chapa", ingredientId: carneHamburguer.id, quantidade: 4, unidade: "un", valorEstimado: 27.2, motivo: "QUEIMA", responsavel: "Chapeiro", diasAtras: 9 },
      { empresaId: zarkiSushi.id, setor: "Sushibar", ingredientId: salmao.id, quantidade: 0.6, unidade: "kg", valorEstimado: 40.8, motivo: "PERDA_LIMPEZA", responsavel: "Chef Zarki", diasAtras: 3 },
      { empresaId: zarkiSushi.id, setor: "Sushibar", ingredientId: nori.id, quantidade: 8, unidade: "un", valorEstimado: 14.4, motivo: "PRODUTO_DANIFICADO", responsavel: "Sushiman", diasAtras: 6 },
    ];
    for (const l of lossData) {
      const data = new Date(today);
      data.setDate(data.getDate() - l.diasAtras);
      await prisma.loss.create({
        data: {
          empresaId: l.empresaId,
          setor: l.setor,
          ingredientId: l.ingredientId,
          quantidade: l.quantidade,
          unidade: l.unidade,
          valorEstimado: l.valorEstimado,
          motivo: l.motivo,
          responsavel: l.responsavel,
          aprovador: "Gerente",
          data,
          createdById: admin.id,
          createdAt: data,
        },
      });
      await prisma.stockMovement.create({
        data: {
          ingredientId: l.ingredientId,
          empresaId: l.empresaId,
          type: "PERDA",
          quantidade: l.quantidade,
          estoqueApos: 0,
          motivo: `Perda — ${l.motivo}`,
          origin: "PERDA",
          createdById: admin.id,
          createdAt: data,
        },
      });
    }

    // --- Estoque: transferência entre lojas (embalagens emprestadas) ---
    const transferData = new Date(today);
    transferData.setDate(transferData.getDate() - 5);
    await prisma.transfer.create({
      data: {
        origemEmpresaId: nordPizza.id,
        destinoEmpresaId: zarkiSushi.id,
        status: "RECEBIDA",
        responsavelEnvio: "Gerente Nord",
        responsavelRecebimento: "Gerente Zarki",
        dataEnvio: transferData,
        dataRecebimento: transferData,
        observacao: "Empréstimo de embalagens para pico de delivery.",
        createdById: admin.id,
        createdAt: transferData,
        items: {
          create: [{ ingredientId: caixaPizza.id, unidade: "un", quantidadeEnviada: 40, quantidadeRecebida: 40 }],
        },
      },
    });
    await prisma.stockMovement.create({
      data: {
        ingredientId: caixaPizza.id,
        empresaId: nordPizza.id,
        type: "TRANSFERENCIA",
        quantidade: 40,
        estoqueApos: caixaPizza.estoqueAtual - 40,
        motivo: "Transferência enviada para Zarki Sushi",
        origin: "TRANSFERENCIA_ENVIADA",
        destino: "Zarki Sushi",
        createdById: admin.id,
        createdAt: transferData,
      },
    });

    // --- Estoque: contagem semanal (concluída, com pequena divergência) e mensal (aprovada) ---
    function isoWeek(d: Date) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    }

    const weeklyDate = new Date(today);
    weeklyDate.setDate(weeklyDate.getDate() - 2);
    const weeklyCount = await prisma.stockCount.create({
      data: {
        empresaId: nordPizza.id,
        type: "SEMANAL",
        setor: "Câmara fria",
        semana: isoWeek(weeklyDate),
        ano: weeklyDate.getFullYear(),
        dataContagem: weeklyDate,
        responsavel: "Chef de Cozinha",
        horaInicio: "07:30",
        horaFim: "08:10",
        status: "CONCLUIDA",
        createdById: admin.id,
        createdAt: weeklyDate,
        items: {
          create: [
            { ingredientId: mussarela.id, setor: "Câmara fria", estoqueEsperado: 19.2, quantidadeContada: 18, diferencaQtd: -1.2, diferencaPercent: -6.25, diferencaReais: -39.5, status: "DIVERGENCIA", justificativa: "Perda por vencimento já lançada no sistema." },
            { ingredientId: presunto.id, setor: "Câmara fria", estoqueEsperado: 9, quantidadeContada: 9, diferencaQtd: 0, diferencaPercent: 0, diferencaReais: 0, status: "APROVADO" },
          ],
        },
      },
    });
    await prisma.stockCount.update({ where: { id: weeklyCount.id }, data: { aprovadoPor: "Gerente Nord", aprovadoEm: weeklyDate } });

    const monthlyDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyCount = await prisma.stockCount.create({
      data: {
        empresaId: zarkiSushi.id,
        type: "MENSAL",
        mes: monthlyDate.getMonth() + 1,
        ano: monthlyDate.getFullYear(),
        dataContagem: monthlyDate,
        responsavel: "Chef Zarki",
        horaInicio: "06:00",
        horaFim: "09:40",
        status: "APROVADA",
        checklistJson: JSON.stringify({
          setoresContados: true,
          comprasLancadas: true,
          notasConferidas: true,
          transferenciasRegistradas: true,
          perdasLancadas: true,
          cortesiasRegistradas: true,
          consumoInternoRegistrado: true,
          produtosSemCustoCorrigidos: true,
          divergenciasJustificadas: true,
        }),
        aprovadoPor: "Administrador Nord",
        aprovadoEm: monthlyDate,
        createdById: admin.id,
        createdAt: monthlyDate,
        items: {
          create: [
            { ingredientId: salmao.id, estoqueEsperado: 12, quantidadeContada: 11.4, diferencaQtd: -0.6, diferencaPercent: -5, diferencaReais: -40.8, status: "APROVADO", justificativa: "Perda por limpeza já lançada." },
            { ingredientId: arroz.id, estoqueEsperado: 25, quantidadeContada: 25, diferencaQtd: 0, diferencaPercent: 0, diferencaReais: 0, status: "APROVADO" },
            { ingredientId: nori.id, estoqueEsperado: 90, quantidadeContada: 82, diferencaQtd: -8, diferencaPercent: -8.9, diferencaReais: -14.4, status: "APROVADO", justificativa: "Produto danificado no transporte." },
          ],
        },
      },
    });
    void monthlyCount;

    // --- Estoque: plano de ação a partir do comparativo Real x Teórico ---
    await prisma.actionPlan.create({
      data: {
        empresaId: zarkiSushi.id,
        problema: "CMV Real acima do Teórico em Pescados",
        causaProvavel: "Porcionamento de salmão acima da ficha técnica no Sushibar",
        acaoCorretiva: "Retreinar equipe de corte com balança e recontar semanalmente por 4 semanas",
        responsavel: "Chef Zarki",
        prazo: new Date(today.getFullYear(), today.getMonth() + 1, 5),
        status: "EM_ANDAMENTO",
        createdById: admin.id,
      },
    });
    await prisma.actionPlan.create({
      data: {
        empresaId: nordPizza.id,
        problema: "Divergência recorrente de Mussarela na contagem semanal",
        causaProvavel: "Validade curta sem rotação adequada (FIFO)",
        acaoCorretiva: "Implementar etiquetas de data de abertura e checklist diário de rotação",
        responsavel: "Gerente Nord",
        prazo: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10),
        status: "PENDENTE",
        createdById: admin.id,
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
