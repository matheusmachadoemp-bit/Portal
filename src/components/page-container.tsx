import { Topbar } from "@/components/topbar";
import { ReactNode } from "react";

export function PageContainer({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle} />
      <main className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto">{children}</main>
    </>
  );
}
