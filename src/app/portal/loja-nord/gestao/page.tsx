import { PageContainer } from "@/components/page-container";
import { Construction } from "lucide-react";

export default function GestaoLojaNordPage() {
  return (
    <PageContainer title="Gestão da Loja Nord" subtitle="Aprovação de resgates, catálogo de brindes e indicadores">
      <div className="nord-card p-8 text-center">
        <Construction size={28} className="text-nord-gray mx-auto mb-3" />
        <p className="text-white text-sm font-medium mb-1">Em construção</p>
        <p className="text-xs text-nord-gray max-w-md mx-auto">
          O painel de gestão (aprovar/recusar resgates, cadastrar brindes e controlar estoque) está sendo
          finalizado e chega em breve.
        </p>
      </div>
    </PageContainer>
  );
}
