import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasModulePermission } from "@/lib/authz";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { StatusDoDiaClient } from "./status-do-dia-client";
import { OcorrenciasClient } from "./ocorrencias-client";

/**
 * "Ocorrências" (subcategoria de Tarefas) — reúne, numa tela só, o que antes eram duas telas
 * separadas sob a categoria "Fechamento do Dia" (removida): o "Status do Dia" (um card por
 * cargo — Gerente/Chef de Salão/Chef de Cozinha — com o status do fechamento de hoje) no topo,
 * e a lista/gestão das FechamentoOcorrencia geradas automaticamente pelas submissões do dia
 * (Fase 3, Mylon) logo abaixo.
 *
 * Este arquivo é só um shell de servidor: o gate de módulo abaixo evita expor a tela pra quem
 * não tem acesso ao Fechamento do Dia (mesmo gate que GET /api/fechamento-dia/status e
 * GET /api/fechamento-dia/ocorrencias já aplicam como primeira checagem em cada uma); os dados
 * de cada bloco vêm 100% daquelas rotas, consumidas pelos respectivos client components abaixo
 * — nenhuma regra de autorização é reimplementada aqui.
 *
 * As duas listas buscadas diretamente aqui (categorias e usuários ativos) são só para alimentar
 * seletores do bloco de Ocorrências (categoria pra editar, responsável pra transformar) — mesmo
 * padrão já usado em Manutenção/Tarefas/Checklist (`prisma.user.findMany` direto no page.tsx
 * pra popular um `<select>`, sem rota própria pra isso).
 */
export default async function OcorrenciasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "fechamento-dia", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canEdit = await hasModulePermission(session.user.id, "fechamento-dia", "canEdit");

  const [categorias, teamMembers] = await Promise.all([
    prisma.fechamentoCategoria.findMany({
      where: { empresaId: { in: empresaIds }, ativa: true },
      select: { id: true, nome: true, icon: true, empresaId: true },
      orderBy: [{ empresaId: "asc" }, { ordem: "asc" }],
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Mesma projeção "campos de vitrine apenas" de Tarefas/Chamados (tarefas-client.tsx,
  // chamados/page.tsx): em modo "single", `ctx.empresa` é o registro completo da loja
  // (inclui tokens de integração — ver comentário de EMPRESA_SUMMARY_SELECT em
  // src/lib/empresa.ts), então nunca repassamos esse objeto inteiro, só id/name.
  const empresas = ctx ? (ctx.mode === "single" ? [ctx.empresa] : ctx.empresas) : [];

  return (
    <PageContainer title="Ocorrências" subtitle="Status do dia + Ocorrências do Fechamento do Dia">
      <div className="space-y-8">
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-white">Status do dia</h2>
          <StatusDoDiaClient />
        </div>
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-white">Ocorrências</h2>
          <OcorrenciasClient
            categorias={categorias}
            teamMembers={teamMembers}
            empresas={empresas.map((e) => ({ id: e.id, name: e.name }))}
            canEdit={canEdit}
          />
        </div>
      </div>
    </PageContainer>
  );
}
