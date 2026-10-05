import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Catch-all de RAIZ pra categoria nova (criada pela sidebar, sem pasta física própria em
// src/app/portal/ — ex.: /portal/custom-1234567890) SEM NENHUMA subcategoria ainda — o único
// caso em que clicar na categoria no menu lateral navega direto pra cá (ver sidebar.tsx: com
// subcategoria, o clique só expande/recolhe, nunca navega). Também alcançável direto por URL a
// qualquer momento (histórico de navegador, link externo etc.), com ou sem subcategoria. Só é
// alcançada quando NENHUMA pasta estática já existente bate com o segmento "[category]" — o
// Next.js App Router sempre prioriza uma pasta literal (ex.: src/app/portal/financeiro/) sobre
// este segmento dinâmico no mesmo nível (confirmado lendo node_modules/next/dist/shared/lib/
// router/utils/sorted-routes.js desta versão: rotas estáticas são sempre "smooshed" antes das
// dinâmicas) — então isto nunca intercepta nenhuma das ~20 categorias de hoje, só uma key
// genuinamente nova. Ver item 4 da tarefa "categoria-generica" e @/lib/generic-content.
export default async function GenericCategoryRootPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  return <GenericModulePage categoryKey={category} />;
}
