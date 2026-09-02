import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, read-only diagnostic route. Delete after use.
// The cleanup-bad-cliente-import dry run found 0 clientes with
// pedidosImportados set, which doesn't match what a profile screenshot
// showed (a Cliente with a matching address from the real import file, and
// a ClienteHistoricoImportado entry with an absurd valorGasto). Need the
// real numbers before acting further.
const FIX_TOKEN = "d1a7c3e9f5b28046a9c7e1f3b5d8206a9c7e1f35b";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const totalClientes = await prisma.cliente.count();
  const comPedidosImportados = await prisma.cliente.count({ where: { pedidosImportados: { not: null } } });
  const comValorGastoImportado = await prisma.cliente.count({ where: { valorGastoImportado: { not: null } } });
  const comEnderecoComPontoEVirgula = await prisma.cliente.count({ where: { endereco: { contains: ";" } } });
  const totalHistorico = await prisma.clienteHistoricoImportado.count();
  const historicoSuspeito = await prisma.clienteHistoricoImportado.findMany({
    where: { valorGasto: { gt: 1000000 } },
    take: 5,
    select: { id: true, clienteId: true, numeroPedido: true, valorGasto: true, createdAt: true, cliente: { select: { nome: true, empresaId: true } } },
  });
  const adriano = await prisma.cliente.findFirst({
    where: { nome: { contains: "ADRIANO OLIVEIRA", mode: "insensitive" } },
    select: {
      id: true,
      nome: true,
      empresaId: true,
      createdAt: true,
      pedidosImportados: true,
      valorGastoImportado: true,
      ticketMedioImportado: true,
      ultimaCompraImportada: true,
      endereco: true,
      historicoImportado: true,
    },
  });

  return NextResponse.json({
    totalClientes,
    comPedidosImportados,
    comValorGastoImportado,
    comEnderecoComPontoEVirgula,
    totalHistorico,
    historicoSuspeito,
    adriano,
  });
}
