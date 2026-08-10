import { Topbar } from "@/components/topbar";
import { ReactNode } from "react";
import { getActiveEmpresaContext } from "@/lib/empresa";

export async function PageContainer({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const ctx = await getActiveEmpresaContext();
  const empresaLabel =
    ctx?.mode === "single" ? ctx.empresa.name : ctx?.mode === "grupo" ? "Grupo Nord (consolidado)" : undefined;
  const empresaColor = ctx?.mode === "single" ? ctx.empresa.color : "#2952E3";

  return (
    <>
      <Topbar title={title} subtitle={subtitle} empresaLabel={empresaLabel} empresaColor={empresaColor} />
      <main className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto">{children}</main>
    </>
  );
}
