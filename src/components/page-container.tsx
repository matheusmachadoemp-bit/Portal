import { Topbar } from "@/components/topbar/topbar";
import { ReactNode } from "react";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { getCurrentUserProfile } from "@/lib/user-profile";
import { BackButton } from "@/components/ui/back-button";

export async function PageContainer({
  title,
  subtitle,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  const [ctx, user] = await Promise.all([getActiveEmpresaContext(), getCurrentUserProfile()]);
  const empresaLabel =
    ctx?.mode === "single" ? ctx.empresa.name : ctx?.mode === "grupo" ? "Grupo Nord (consolidado)" : undefined;
  const empresaColor = ctx?.mode === "single" ? ctx.empresa.color : "#2952E3";

  return (
    <>
      <Topbar title={title} subtitle={subtitle} empresaLabel={empresaLabel} empresaColor={empresaColor} user={user} />
      <main className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto">
        {backHref && <BackButton href={backHref} label={backLabel} />}
        {children}
      </main>
    </>
  );
}
