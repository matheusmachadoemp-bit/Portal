import { PageContainer } from "@/components/page-container";
import { DriveClient } from "./drive-client";
import { getActiveEmpresaContext } from "@/lib/empresa";

export default async function DrivePage() {
  const ctx = await getActiveEmpresaContext();
  const driveFolderUrl = ctx?.mode === "single" ? ctx.empresa.driveFolderUrl : null;

  return (
    <PageContainer title="Marketing" subtitle="Google Drive">
      <DriveClient driveFolderUrl={driveFolderUrl} canEdit={ctx?.mode === "single"} />
    </PageContainer>
  );
}
