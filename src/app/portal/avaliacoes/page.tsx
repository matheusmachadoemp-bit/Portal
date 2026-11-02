import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Raiz de "Avaliações" (categoria com subcategorias — o clique no menu lateral só expande/
// recolhe, nunca navega pra cá; esta rota só é alcançada por URL direta ou pelo `backHref` das
// subcategorias). Mesmo racional de `src/app/portal/reservas/page.tsx`: esta pasta existe só
// porque "respostas/" e "configuracoes/" precisam de uma pasta física "avaliacoes/" — sem um
// `page.tsx` próprio aqui, visitar "/portal/avaliacoes" direto (ex. pelo botão "Voltar") 404aria
// em vez de cair no fallback genérico que o catch-all de raiz `src/app/portal/[category]/page.tsx`
// usaria se esta pasta não existisse.
export default async function AvaliacoesRootPage() {
  return <GenericModulePage categoryKey="avaliacoes" />;
}
