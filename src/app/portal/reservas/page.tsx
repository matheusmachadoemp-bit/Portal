import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Raiz de "Reservas" (categoria com subcategorias — o clique no menu lateral só expande/
// recolhe, nunca navega pra cá; esta rota só é alcançada por URL direta). Etapa 1 não constrói
// nenhum dashboard próprio pra Reservas ainda — cai no mesmo conteúdo genérico de fallback que
// o catch-all de raiz src/app/portal/[category]/page.tsx usaria se esta pasta não existisse
// (ela existe só porque "configuracoes/" e "[sub]/" precisam de uma pasta física "reservas/").
export default async function ReservasRootPage() {
  return <GenericModulePage categoryKey="reservas" />;
}
