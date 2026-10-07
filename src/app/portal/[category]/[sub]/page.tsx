import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Catch-all pra SUBCATEGORIA de uma categoria nova (criada pela sidebar, sem pasta física
// própria em src/app/portal/ — ex.: /portal/custom-1234567890/sub-1234567891). Mesma garantia de
// precedência do [category]/page.tsx irmão (ver comentário lá): só alcançado quando "[category]"
// em si já não bateu com nenhuma pasta estática — uma subcategoria nova de uma categoria JÁ
// EXISTENTE (ex.: Financeiro) nunca cai aqui, e sim no [sub]/page.tsx que vive dentro da própria
// pasta daquela categoria (ex.: src/app/portal/financeiro/[sub]/page.tsx) — o primeiro segmento
// ("financeiro") já bate com a pasta estática antes do router nem considerar este arquivo.
export default async function GenericCategorySubPage({
  params,
}: {
  params: Promise<{ category: string; sub: string }>;
}) {
  const { category, sub } = await params;
  return <GenericModulePage categoryKey={category} subcategoryKey={sub} />;
}
