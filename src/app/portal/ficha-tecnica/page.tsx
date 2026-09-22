import { redirect } from "next/navigation";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { defaultFichaTecnicaSub } from "@/lib/ficha";

export default async function FichaTecnicaRoot() {
  // Manda pra primeira aba de produto que faz sentido pra loja ativa (ex.: Zarki Sushi cai em
  // "Entradas", não mais sempre em "Pizzas Salgadas" da Nord Pizza & Burger — ver
  // defaultFichaTecnicaSub em src/lib/ficha.ts). A checagem de sessão/permissão acontece na
  // própria rota de destino ([sub]/page.tsx), igual já era antes desta mudança.
  const ctx = await getActiveEmpresaContext();
  const empresaKey = ctx?.mode === "single" ? ctx.empresa.key : undefined;
  redirect(`/portal/ficha-tecnica/${defaultFichaTecnicaSub(empresaKey)}`);
}
