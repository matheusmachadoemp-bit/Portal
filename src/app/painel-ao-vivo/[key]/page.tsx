import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PainelAoVivoPublicClient } from "./painel-ao-vivo-public-client";

export default async function PainelAoVivoPublicPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const empresa = await prisma.empresa.findUnique({
    where: { key },
    select: { active: true, name: true },
  });

  if (!empresa || !empresa.active) notFound();

  return <PainelAoVivoPublicClient empresaKey={key} empresaName={empresa.name} />;
}
