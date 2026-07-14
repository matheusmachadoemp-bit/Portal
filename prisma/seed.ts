import "dotenv/config";
import { PrismaClient } from "@prisma/client";
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
    subs: [],
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
    key: "metas",
    name: "Metas",
    icon: "Target",
    order: 3,
    contentType: "metas",
    subs: [
      { key: "gerencia", name: "Metas da Gerência", icon: "Briefcase" },
      { key: "salao", name: "Metas do Salão", icon: "Utensils" },
      { key: "cozinha", name: "Metas da Cozinha", icon: "ChefHat" },
      { key: "delivery", name: "Metas do Delivery", icon: "Bike" },
    ],
  },
  {
    key: "rh",
    name: "RH",
    icon: "Users",
    order: 4,
    contentType: "rh",
    subs: [
      { key: "colaboradores", name: "Colaboradores", icon: "IdCard" },
      { key: "ocorrencias", name: "Ocorrências", icon: "AlertTriangle" },
    ],
  },
  {
    key: "administrativo",
    name: "Administrativo",
    icon: "Building2",
    order: 5,
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
    order: 6,
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
    key: "configuracoes",
    name: "Configurações",
    icon: "Settings",
    order: 7,
    contentType: "configuracoes",
    subs: [],
  },
  { key: "usuarios", name: "Usuários", icon: "UserCog", order: 8, contentType: "usuarios", subs: [] },
];

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("Nord@2026", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@nordpizza.com" },
    update: {},
    create: {
      name: "Administrador Nord",
      email: "admin@nordpizza.com",
      passwordHash,
      role: "ADMINISTRADOR",
    },
  });

  const gerentePass = await bcrypt.hash("Gerente@2026", 10);
  const gerente = await prisma.user.upsert({
    where: { email: "gerente@nordpizza.com" },
    update: {},
    create: {
      name: "Gerente Nord",
      email: "gerente@nordpizza.com",
      passwordHash: gerentePass,
      role: "GERENTE",
    },
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

  // --- Vendas: last 30 days ---
  const today = new Date();
  const existingSales = await prisma.salesEntry.count();
  if (existingSales === 0) {
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const base = 3200 + Math.random() * 1800;
      const delivery = Math.round(base * 0.55);
      const salao = Math.round(base * 0.45);
      await prisma.salesEntry.create({
        data: {
          date,
          faturamentoDelivery: delivery,
          faturamentoSalao: salao,
          pedidosDelivery: Math.round(delivery / 65),
          pedidosBalcao: Math.round(Math.random() * 8),
          pedidosSalao: Math.round(salao / 95),
          mesasAtendidas: Math.round(salao / 130),
          taxaServicoValor: Math.round(salao * 0.1),
          metaDiaria: 4200,
          createdById: admin.id,
        },
      });
    }
  }

  // --- Marketing: last 6 months ---
  const existingMkt = await prisma.marketingEntry.count();
  if (existingMkt === 0) {
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const invest = 800 + Math.random() * 600;
      const receita = invest * (2.5 + Math.random() * 2);
      const visitas = 2000 + Math.round(Math.random() * 3000);
      const conversoes = Math.round(visitas * (0.02 + Math.random() * 0.03));
      const alcance = 15000 + Math.round(Math.random() * 10000);
      await prisma.marketingEntry.create({
        data: {
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

  // --- Metas ---
  const existingGoals = await prisma.goal.count();
  if (existingGoals === 0) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    await prisma.goal.createMany({
      data: [
        {
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
      ],
    });
  }

  // --- RH ---
  const existingEmployees = await prisma.employee.count();
  if (existingEmployees === 0) {
    const employees = await prisma.$transaction([
      prisma.employee.create({
        data: {
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
          name: "Bruno Costa",
          cargo: "Motoboy",
          setor: "Delivery",
          admissionDate: new Date(2022, 8, 20),
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
  }

  // --- Ficha técnica: insumos + produto exemplo ---
  const existingIngredients = await prisma.ingredient.count();
  if (existingIngredients === 0) {
    const massa = await prisma.ingredient.create({
      data: {
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
  }

  console.log("Seed concluído.");
  console.log("Login admin: admin@nordpizza.com / Nord@2026");
  console.log(`Login gerente: ${gerente.email} / Gerente@2026`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
