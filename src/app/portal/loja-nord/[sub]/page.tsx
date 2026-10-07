import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Catch-all pra SUBCATEGORIA nova de "loja-nord" (categoria já existente, com pasta física própria —
// ver src/app/portal/loja-nord/page.tsx e as demais pastas estáticas aqui dentro) sem rota própria
// ainda. Só alcançado quando o segmento "sub" não bate com nenhuma das pastas estáticas já
// existentes dentro de "loja-nord/" (Next.js App Router sempre prioriza pasta literal sobre este
// segmento dinâmico no mesmo nível — ver comentário completo em
// src/app/portal/[category]/[sub]/page.tsx). Ver @/lib/generic-content para o resto do fluxo.
export default async function LojaNordGenericSubPage({
  params,
}: {
  params: Promise<{ sub: string }>;
}) {
  const { sub } = await params;
  return <GenericModulePage categoryKey="loja-nord" subcategoryKey={sub} />;
}
