import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Catch-all pra SUBCATEGORIA nova de "administrativo" (categoria já existente, com pasta física própria —
// ver src/app/portal/administrativo/page.tsx e as demais pastas estáticas aqui dentro) sem rota própria
// ainda. Só alcançado quando o segmento "sub" não bate com nenhuma das pastas estáticas já
// existentes dentro de "administrativo/" (Next.js App Router sempre prioriza pasta literal sobre este
// segmento dinâmico no mesmo nível — ver comentário completo em
// src/app/portal/[category]/[sub]/page.tsx). Ver @/lib/generic-content para o resto do fluxo.
export default async function AdministrativoGenericSubPage({
  params,
}: {
  params: Promise<{ sub: string }>;
}) {
  const { sub } = await params;
  return <GenericModulePage categoryKey="administrativo" subcategoryKey={sub} />;
}
