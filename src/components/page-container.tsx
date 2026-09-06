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
      <main className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto">
        {backHref && <BackButton href={backHref} label={backLabel} />}
        {children}
      </main>
    </>
  );
}
