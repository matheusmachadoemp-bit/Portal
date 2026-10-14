import { prisma } from "@/lib/prisma";
import { assertEmpresaAccess } from "@/lib/empresa";
import { formatCurrency } from "@/lib/calc";

/**
 * Resultado de uma checagem de duplicidade por código de barras/Pix. Quando o lançamento
 * encontrado é de uma loja que o usuário logado NÃO tem acesso, `visible` vem `false` e nenhum
 * outro campo é preenchido — ver `findPayableDuplicate` para o motivo (nunca vazar fornecedor,
 * valor ou nome da loja de um lançamento fora do alcance do usuário, mesmo quando o BLOQUEIO em
 * si da duplicidade precisa continuar valendo globalmente).
 */
export type PayableDuplicateInfo =
  | {
      visible: true;
      id: string;
      number: string;
      fornecedor: string;
      valor: number;
      dataVencimento: string;
      status: string;
      empresa: string;
    }
  | { visible: false };

/**
 * Procura outro `Payable` com o mesmo código de barras/Pix. A unicidade é GLOBAL (ver
 * `schema.prisma`), então a busca aqui também é global — nunca filtrada pela loja ativa — porque
 * o objetivo é impedir o mesmo boleto de ser lançado em QUALQUER loja, não só na de quem está
 * cadastrando agora.
 *
 * Quando acha um lançamento de uma loja que o usuário logado não tem acesso (`assertEmpresaAccess`
 * devolve `false`), o retorno ainda sinaliza a duplicidade (`visible: false`, sem mais detalhes)
 * em vez de devolver `null` como se não houvesse nada — o cadastro continua bloqueado (a
 * obrigação de não deixar pagar o mesmo boleto duas vezes vale pra qualquer loja), só que sem
 * revelar fornecedor/valor/data/nome da loja de um registro fora do alcance do usuário. Mesmo
 * padrão já usado em `src/app/api/ficha-tecnica/insumos/excluir-lote/route.ts` (nunca vazar o nome
 * de um registro de uma loja sem acesso, mesmo quando a ação em si precisa continuar bloqueada).
 *
 * `excludeId`: ao editar um lançamento que já tinha esse código, ele não é duplicado dele mesmo.
 */
export async function findPayableDuplicate(
  codigoBarras: string,
  userId: string,
  role: string,
  excludeId?: string
): Promise<PayableDuplicateInfo | null> {
  const existing = await prisma.payable.findUnique({
    where: { codigoBarras },
    select: {
      id: true,
      number: true,
      fornecedor: true,
      valor: true,
      dataVencimento: true,
      status: true,
      empresaId: true,
      empresa: { select: { name: true } },
    },
  });
  if (!existing || existing.id === excludeId) return null;

  const canSee = await assertEmpresaAccess(userId, role, existing.empresaId);
  if (!canSee) return { visible: false };

  return {
    visible: true,
    id: existing.id,
    number: existing.number,
    fornecedor: existing.fornecedor,
    valor: existing.valor,
    dataVencimento: existing.dataVencimento.toISOString(),
    status: existing.status,
    empresa: existing.empresa.name,
  };
}

/** Mensagem de erro pronta para a resposta 409 do POST/PATCH (ver rotas em `api/financeiro/pagar`). */
export function formatDuplicateMessage(d: PayableDuplicateInfo): string {
  if (!d.visible) {
    return "Este código de barras/Pix já está cadastrado em outra loja. Não é possível lançar o mesmo boleto duas vezes.";
  }
  const data = new Date(d.dataVencimento).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `Este código de barras/Pix já está cadastrado: ${d.number} — ${d.fornecedor} — ${formatCurrency(d.valor)} — vencimento ${data} (loja ${d.empresa}).`;
}
