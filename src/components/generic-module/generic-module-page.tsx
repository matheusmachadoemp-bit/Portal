import { PageContainer } from "@/components/page-container";
import { GenericFolderManager, type GenericFileScope } from "./generic-folder-manager";
import { loadGenericContent } from "@/lib/generic-content";

/**
 * Página genérica de fallback (schema+API da Fase 1 desta tarefa — tela ainda não polida
 * visualmente, isso é Fase 2, do Caio) para toda categoria/subcategoria do menu lateral sem
 * módulo/rota física própria. Usada por três grupos de chamadores (ver @/lib/generic-content
 * para a lista completa) — cada `page.tsx` chamador é só um wrapper fino:
 *
 * ```tsx
 * export default async function FinanceiroSubPage({ params }: { params: Promise<{ sub: string }> }) {
 *   const { sub } = await params;
 *   return <GenericModulePage categoryKey="financeiro" subcategoryKey={sub} />;
 * }
 * ```
 *
 * `loadGenericContent` já cuida de toda a parte de achar o registro no banco (404 se a `key` da
 * URL não corresponder a nenhuma Category/Subcategory cadastrada) e de permissão (redireciona pra
 * "/portal/inicio" sem `canView`) — ver o comentário completo lá.
 */
export async function GenericModulePage({
  categoryKey,
  subcategoryKey,
}: {
  categoryKey: string;
  subcategoryKey?: string;
}) {
  const data = await loadGenericContent({ categoryKey, subcategoryKey });
  const { scope } = data;

  const subtitle = scope.kind === "subcategory" ? scope.subcategoryName : undefined;
  const fileScope: GenericFileScope =
    scope.kind === "subcategory" ? { subcategoryId: scope.id } : { categoryId: scope.id };

  return (
    <PageContainer title={scope.categoryName} subtitle={subtitle}>
      <div className="space-y-6">
        <GenericFolderManager
          scope={fileScope}
          initialFiles={data.files}
          permissions={{ canCreate: data.canCreate, canEdit: data.canEdit, canDelete: data.canDelete }}
        />
      </div>
    </PageContainer>
  );
}
