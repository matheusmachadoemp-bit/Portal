import { Topbar } from "@/components/topbar/topbar";
import { ReactNode } from "react";
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
  const user = await getCurrentUserProfile();

  return (
    <>
      <Topbar title={title} subtitle={subtitle} user={user} />
      {/* `id`/`tabIndex={-1}` são o alvo do skip link ("Pular para o
          conteúdo") renderizado em `src/app/portal/layout.tsx`: permitem
          mover o foco pra cá via `href="#main-content"` mesmo este `<main>`
          não sendo naturalmente focável. `outline-none` só tira o contorno
          padrão do navegador ao redor do container inteiro quando o foco
          chega por aqui — o link em si já mostra o próprio indicador visual
          de foco antes de ser ativado. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto outline-none"
      >
        {backHref && <BackButton href={backHref} label={backLabel} />}
        {children}
      </main>
    </>
  );
}
