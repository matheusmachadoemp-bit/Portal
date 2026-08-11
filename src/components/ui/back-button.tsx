import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackButton({ href, label = "Voltar" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs text-nord-gray hover:text-white mb-3 w-fit"
    >
      <ArrowLeft size={13} />
      {label}
    </Link>
  );
}
