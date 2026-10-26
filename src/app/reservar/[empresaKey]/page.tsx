import { prisma } from "@/lib/prisma";
import { ReservarClient } from "./reservar-client";

/**
 * Página pública de reserva (Etapa 3, sem sessão) — `/reservar/[empresaKey]`. Mesmo padrão de
 * página pública já usado em `src/app/avaliar/[token]/page.tsx` e `src/app/pesquisa/[token]/
 * page.tsx`: resolve a loja direto por um identificador público (aqui, `Empresa.key` — já usado
 * internamente para identificar a loja em modo "single", ver `src/lib/ficha.ts`/`src/app/portal/
 * ficha-tecnica/**`; reaproveitado aqui, não um token novo, porque a URL de reserva de uma loja é
 * uma informação pública e estável por natureza — faz sentido ser compartilhável/decorável, ao
 * contrário de um link de avaliação/pesquisa individual) e nunca seleciona nenhum campo sensível
 * (token de integração, etc.) em `Empresa`. Middleware já libera `/reservar` e `/api/reservar`
 * como rotas públicas (`src/middleware.ts`).
 */
export default async function ReservarPage({ params }: { params: Promise<{ empresaKey: string }> }) {
  const { empresaKey } = await params;

  const empresa = await prisma.empresa.findUnique({
    where: { key: empresaKey },
    select: { id: true, name: true, logo: true, color: true, active: true },
  });

  if (!empresa || !empresa.active) {
    return (
      <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-nord-panel border border-nord-border rounded-2xl p-6 text-center space-y-2">
          <h1 className="text-white font-semibold text-lg">Loja não encontrada</h1>
          <p className="text-nord-gray text-sm">Confira se o link foi copiado corretamente.</p>
        </div>
      </div>
    );
  }

  const environments = await prisma.reservationEnvironment.findMany({
    where: { empresaId: empresa.id, active: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true, capacity: true },
  });

  if (environments.length === 0) {
    return (
      <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-nord-panel border border-nord-border rounded-2xl p-6 text-center space-y-2">
          <h1 className="text-white font-semibold text-lg">Reservas indisponíveis no momento</h1>
          <p className="text-nord-gray text-sm">{empresa.name} ainda não configurou ambientes para reserva.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-nord-black">
      <ReservarClient
        empresaKey={empresaKey}
        empresa={{ name: empresa.name, logo: empresa.logo, color: empresa.color }}
        environments={environments}
      />
    </div>
  );
}
