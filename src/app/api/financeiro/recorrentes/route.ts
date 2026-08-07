import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { addMonths, setDate } from "date-fns";

const MAX_INFINITE_MONTHS = 24; // gera 24 meses por vez para recorrências infinitas

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const templates = await prisma.recurringTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { categoria: true, bankAccount: true },
  });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const tipo: "PAGAR" | "RECEBER" = body.tipo;
  const valor = Number(body.valor) || 0;
  const diaVencimento = Number(body.diaVencimento) || 1;
  const dataInicio = new Date(body.dataInicio);
  const meses = body.infinita ? MAX_INFINITE_MONTHS : Number(body.quantidadeMeses) || 1;

  const template = await prisma.recurringTemplate.create({
    data: {
      tipo,
      descricao: body.descricao,
      fornecedorCliente: body.fornecedorCliente || null,
      categoriaId: body.categoriaId,
      empresa: body.empresa,
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

  const entries = [];
  for (let i = 0; i < meses; i++) {
    const competencia = addMonths(dataInicio, i);
    const vencimento = setDate(competencia, diaVencimento);
    entries.push({
      descricao: body.descricao,
      categoriaId: body.categoriaId,
      empresa: body.empresa,
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
