import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Image from "next/image";
import { notFound } from "next/navigation";

export default async function CertificateVerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const certificate = await prisma.trainingCertificate.findUnique({
    where: { code: code.toUpperCase() },
    include: { user: { select: { name: true } }, course: { select: { name: true, instructor: true } } },
  });

  if (!certificate) notFound();

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
    `${process.env.NEXTAUTH_URL ?? ""}/certificado/${certificate.code}`
  )}`;

  return (
    <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6 print:bg-white">
      <div className="w-full max-w-3xl bg-white text-nord-black rounded-2xl p-10 shadow-2xl border-8 border-nord-blue/10 relative">
        <div className="flex items-center justify-between mb-8">
          <Image src="/logo-nord.svg" alt="Nord" width={140} height={38} />
          <span className="text-xs text-gray-500 font-medium tracking-widest uppercase">Universidade Grupo Nord</span>
        </div>

        <p className="text-center text-sm text-gray-500 mb-2 tracking-widest uppercase">Certificado de Conclusão</p>
        <h1 className="text-center text-3xl font-bold mb-6">{certificate.user.name}</h1>
        <p className="text-center text-gray-600 mb-1">concluiu com êxito o curso</p>
        <h2 className="text-center text-xl font-semibold text-nord-blue mb-6">{certificate.course.name}</h2>

        <div className="flex items-center justify-center gap-10 text-sm text-gray-600 mb-8">
          <div className="text-center">
            <p className="font-semibold text-gray-900">{certificate.cargaHoraria} min</p>
            <p>Carga horária</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{format(certificate.issuedAt, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
            <p>Data de emissão</p>
          </div>
          {certificate.course.instructor && (
            <div className="text-center">
              <p className="font-semibold text-gray-900">{certificate.course.instructor}</p>
              <p>Instrutor</p>
            </div>
          )}
        </div>

        <div className="flex items-end justify-between border-t border-gray-200 pt-6">
          <div>
            <p className="text-sm text-gray-500">Código de validação</p>
            <p className="font-mono text-sm">{certificate.code}</p>
            <p className="text-xs text-gray-400 mt-1">Assinatura digital — Grupo Nord</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR Code de validação" width={90} height={90} />
        </div>
      </div>
    </div>
  );
}
