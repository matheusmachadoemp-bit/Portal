import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/**
 * Motivos de avaliação negativa (`CustomerSurveyReasonTag`) ativos: compartilhados (`empresaId =
 * null`, catálogo padrão seedado) somados aos próprios da loja pedida — mesma UNION já usada
 * pelas perguntas (`GET /api/satisfacao-cliente/perguntas`), só que aqui sempre filtrando
 * `ativo: true` (isto não é uma tela de administração do catálogo — só o seletor de motivo do
 * formulário "Registrar solução"; não existe CRUD de motivos ainda, só o seed).
 *
 * Alimenta o `<select>` de `POST .../avaliacoes/[id]/resolver`, na tela de detalhe de UMA
 * avaliação — por isso a loja não é necessariamente "a loja ativa" do cookie de sessão: mesmo
 * raciocínio já documentado em `GET /api/satisfacao-cliente/avaliacoes/[id]`, um usuário Grupo
 * Nord pode estar vendo/resolvendo uma avaliação de uma loja diferente da que está selecionada no
 * momento (a página de detalhe já devolve `avaliacao.empresa.id`, então o formulário sempre tem
 * esse valor disponível pra mandar aqui). Por isso aceita um `empresaId` explícito na query,
 * validado contra o acesso REAL do usuário àquela loja (`assertEmpresaAccess`, o mesmo guard de
 * `.../assumir`/`.../resolver` — não `empresaIdsForContext`/contexto ativo, que só reflete a loja
 * selecionada agora) — e só cai para `requireActiveSingleEmpresa()` (mesmo padrão de
 * `GET /api/satisfacao-cliente/mesas`) quando `empresaId` não é informado, cobrindo o caso comum
 * de um usuário fora do modo Grupo Nord.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Módulo "crm" (não "satisfacao-cliente"): esta rota só alimenta o formulário de "Registrar
  // solução" da tela de Avaliações, que virou subcategoria de CRM — ver comentário completo em
  // src/app/portal/satisfacao-cliente/visao-geral/page.tsx.
  if (!(await hasModulePermission(session.user.id, "crm", "canView", "avaliacoes"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver os motivos de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const empresaIdParam = req.nextUrl.searchParams.get("empresaId");
  let empresaId: string;
  if (empresaIdParam) {
    if (!(await assertEmpresaAccess(session.user.id, session.user.role, empresaIdParam))) {
      return NextResponse.json({ error: "Loja inválida ou sem acesso." }, { status: 403 });
    }
    empresaId = empresaIdParam;
  } else {
    const empresa = await requireActiveSingleEmpresa();
    if (!empresa) {
      return NextResponse.json(
        { error: "Selecione uma loja específica (ou informe empresaId) — não é possível listar motivos no modo Grupo Nord sem indicar a loja." },
        { status: 400 }
      );
    }
    empresaId = empresa.id;
  }

  const motivos = await prisma.customerSurveyReasonTag.findMany({
    where: { ativo: true, OR: [{ empresaId: null }, { empresaId }] },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });

  return NextResponse.json({ motivos });
}
