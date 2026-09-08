import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock, CalendarDays, Flame } from "lucide-react";

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
  const year = certificate.issuedAt.getFullYear();
  const horas = Math.floor(certificate.cargaHoraria / 60);
  const minutos = certificate.cargaHoraria % 60;
  const cargaHorariaLabel = horas > 0 ? `${horas}h${minutos > 0 ? ` ${minutos}min` : ""}` : `${minutos} min`;

  return (
    <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6 print:bg-white">
      <div className="relative w-full max-w-5xl bg-white text-nord-black rounded-2xl shadow-2xl overflow-hidden">
        {/* Marca d'água da chama, sangrando pela direita */}
        <Flame
          className="absolute -right-24 -bottom-24 text-[#2952E3]/[0.06] pointer-events-none"
          style={{ width: 620, height: 620 }}
          strokeWidth={0}
          fill="currentColor"
        />

        {/* Faixa "NORD SEMPRE" na borda esquerda */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-[#05070a] flex items-center justify-center">
          <span
            className="text-[9px] tracking-[0.2em] text-white/70 font-medium uppercase whitespace-nowrap"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Nord sempre
          </span>
        </div>
        <div className="absolute left-8 top-0 bottom-0 w-1 bg-[#2952E3]" />

        {/* Recortes diagonais nos cantos */}
        <div
          className="absolute -left-2 -top-2 w-24 h-24 bg-[#05070a]"
          style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        />
        <div
          className="absolute -right-2 -bottom-2 w-20 h-20 bg-[#05070a]"
          style={{ clipPath: "polygon(100% 100%, 0 100%, 100% 0)" }}
        />
        <div
          className="absolute right-0 bottom-0 w-14 h-14 bg-[#2952E3]"
          style={{ clipPath: "polygon(100% 100%, 30% 100%, 100% 30%)" }}
        />

        <div className="relative px-12 md:px-16 py-10 md:py-12 ml-8">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-3">
              <Image src="/logo-nord.svg" alt="Nord" width={150} height={41} />
              <div className="h-9 w-px bg-gray-300" />
              <div className="text-[11px] leading-tight tracking-[0.15em] text-gray-500 uppercase">
                <p>Universidade</p>
                <p className="font-bold text-nord-black">Grupo Nord</p>
              </div>
            </div>
            <div className="text-right text-[9px] leading-relaxed tracking-[0.2em] text-gray-400 uppercase pt-1 mr-32 md:mr-36">
              <p>Pessoas</p>
              <p>Boas comidas</p>
              <p>Grandes</p>
              <p>Histórias</p>
              <div className="h-0.5 w-10 bg-[#2952E3] ml-auto mt-1.5" />
            </div>
          </div>

          {/* Selo "Concluído" */}
          <div className="absolute right-10 top-24 md:right-14 flex flex-col items-center">
            <div className="w-[118px] h-[118px] rounded-full bg-[#0f1f4a] border-[3px] border-[#2952E3]/60 flex flex-col items-center justify-center text-white shadow-lg">
              <Flame size={20} fill="currentColor" strokeWidth={0} className="text-white mb-1" />
              <p className="text-[13px] font-bold tracking-wide">CONCLUÍDO</p>
              <p className="text-[7px] tracking-[0.15em] uppercase text-white/70 mt-1">Universidade</p>
              <p className="text-[7px] tracking-[0.15em] uppercase text-white/70">Nord</p>
              <p className="text-[10px] font-semibold mt-0.5">{year}</p>
            </div>
            <div className="flex -mt-1">
              <div
                className="w-7 h-9 bg-[#2952E3]"
                style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)", transform: "rotate(-8deg)" }}
              />
              <div
                className="w-7 h-9 bg-[#1e3fb8] -ml-1"
                style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)", transform: "rotate(8deg)" }}
              />
            </div>
          </div>

          {/* Título */}
          <div className="text-center mb-8 mt-2">
            <h1 className="text-4xl md:text-5xl font-extrabold text-nord-black tracking-tight leading-none">CERTIFICADO</h1>
            <p className="text-xl md:text-2xl font-bold text-[#2952E3] tracking-[0.2em] mt-1">DE CONCLUSÃO</p>
            <div className="h-0.5 w-14 bg-[#2952E3] mx-auto mt-3" />
          </div>

          {/* Corpo */}
          <div className="text-center mb-8">
            <p className="text-sm text-gray-500 mb-2">A Universidade Grupo Nord certifica que</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-nord-black pb-3 border-b border-gray-200 inline-block px-6">
              {certificate.user.name}
            </h2>
            <p className="text-sm text-gray-500 mt-4 mb-1">concluiu com êxito o curso</p>
            <h3 className="text-2xl md:text-3xl font-extrabold text-[#2952E3] mb-3">{certificate.course.name}</h3>
            <p className="text-xs md:text-sm text-gray-500 max-w-lg mx-auto">
              Parabéns por investir no seu desenvolvimento e fazer parte da cultura de alta performance da Nord.
            </p>
          </div>

          {/* Cards de informação */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
            <div className="flex items-center gap-3 bg-[#eef2fd] rounded-xl px-5 py-3">
              <div className="w-9 h-9 rounded-lg bg-[#2952E3] flex items-center justify-center shrink-0">
                <Clock size={16} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] tracking-widest text-gray-500 uppercase">Carga horária</p>
                <p className="text-sm font-bold text-nord-black">{cargaHorariaLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-[#eef2fd] rounded-xl px-5 py-3">
              <div className="w-9 h-9 rounded-lg bg-[#2952E3] flex items-center justify-center shrink-0">
                <CalendarDays size={16} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] tracking-widest text-gray-500 uppercase">Data de conclusão</p>
                <p className="text-sm font-bold text-nord-black">
                  {format(certificate.issuedAt, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            {certificate.course.instructor && (
              <div className="flex items-center gap-3 bg-[#eef2fd] rounded-xl px-5 py-3">
                <div className="w-9 h-9 rounded-lg bg-[#2952E3] flex items-center justify-center shrink-0">
                  <Flame size={16} fill="currentColor" strokeWidth={0} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] tracking-widest text-gray-500 uppercase">Instrutor</p>
                  <p className="text-sm font-bold text-nord-black">{certificate.course.instructor}</p>
                </div>
              </div>
            )}
          </div>

          {/* Rodapé */}
          <div className="flex items-end justify-between gap-4">
            <div className="max-w-[220px]">
              <p className="text-lg italic text-gray-700" style={{ fontFamily: "cursive" }}>
                Evoluir é parte da nossa receita.
              </p>
              <div className="h-0.5 w-10 bg-[#2952E3] mt-1 mb-4" />
              <p className="text-[10px] text-gray-500">Código de validação</p>
              <p className="font-mono text-xs font-semibold text-nord-black">{certificate.code}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">Verifique a autenticidade deste certificado.</p>
            </div>

            <div className="text-center">
              <p className="text-2xl italic text-gray-700 mb-1" style={{ fontFamily: "cursive" }}>
                Grupo Nord
              </p>
              <div className="h-px w-40 bg-gray-300 mx-auto mb-1" />
              <p className="text-xs font-bold text-nord-black tracking-wide">GRUPO NORD</p>
              <p className="text-[9px] text-gray-400 tracking-widest uppercase">Assinatura digital</p>
            </div>

            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR Code de validação" width={80} height={80} />
              <p className="text-[9px] text-gray-500 max-w-[110px] leading-snug">
                Escaneie o QR Code para validar este certificado no Portal Nord.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
