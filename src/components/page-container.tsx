import { Topbar } from "@/components/topbar";
import { ReactNode } from "react";
import { BackButton } from "@/components/ui/back-button";

export function PageContainer({
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
  return (
    <>
      <Topbar title={title} subtitle={subtitle} />
      <main className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto">
        {backHref && <BackButton href={backHref} label={backLabel} />}
        {children}
      </main>
    </>
  );
}
