import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { RelatoriosClient } from "./relatorios-client";

export default async function RelatoriosPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  return (
    <PageContainer title="Financeiro" subtitle="Relatórios">
      <div className="space-y-6">
        <RelatoriosClient />
      </div>
    </PageContainer>
  );
}
