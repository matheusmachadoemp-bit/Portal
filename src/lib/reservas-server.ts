import type { ReservationWaitlistEntry } from "@prisma/client";
import { storedDayKey } from "@/lib/timezone";

// Reservas — Etapa 4 (Fila de Espera). Helpers compartilhados entre as duas rotas de API
// (src/app/api/reservas/fila-espera/route.ts e .../[id]/route.ts) que dependem do Prisma Client
// — separado de `src/lib/reservas.ts` de propósito, porque aquele arquivo é importado também
// por componentes `"use client"` e nunca pode puxar o Prisma Client pro bundle do navegador
// (mesmo racional de `src/lib/customer-survey-server.ts`).

export function serializeWaitlistEntry(entry: ReservationWaitlistEntry) {
  return {
    id: entry.id,
    customerName: entry.customerName,
    customerPhone: entry.customerPhone,
    partySize: entry.partySize,
    desiredDate: storedDayKey(entry.desiredDate),
    desiredTime: entry.desiredTime,
    status: entry.status,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
