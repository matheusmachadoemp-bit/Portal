import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { Award } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { canManageUsers } from "@/lib/permissions";

export default async function CertificadosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = canManageUsers(session.user.role);

  const certificates = await prisma.trainingCertificate.findMany({
    where: isAdmin ? {} : { userId: session.user.id },
    orderBy: { issuedAt: "desc" },
    include: { user: { select: { name: true } }, course: { select: { name: true, instructor: true } } },
  });

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Certificados">
      <div className="space-y-6">
        {certificates.length === 0 ? (
          <p className="text-sm text-nord-gray text-center py-8">Nenhum certificado emitido ainda.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {certificates.map((c) => (
              <Link
                key={c.id}
                href={`/certificado/${c.code}`}
                target="_blank"
                className="nord-card p-4 hover:border-nord-blue/50 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Award size={18} className="text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{c.course.name}</p>
                    {isAdmin && <p className="text-xs text-nord-gray truncate">{c.user.name}</p>}
                  </div>
                </div>
                <p className="text-xs text-nord-gray">Carga horária: {c.cargaHoraria}min</p>
                <p className="text-xs text-nord-gray">Emitido em {format(c.issuedAt, "dd/MM/yyyy")}</p>
                <p className="text-[10px] text-nord-gray/70 font-mono">{c.code}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
