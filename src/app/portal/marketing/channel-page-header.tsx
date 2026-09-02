import Link from "next/link";
import { DynamicIcon } from "@/components/dynamic-icon";

const PAID_CHANNELS = [
  { href: "/portal/marketing/meta-ads", label: "Meta Ads", icon: "Megaphone" },
  { href: "/portal/marketing/google-ads", label: "Google Ads", icon: "Search" },
];

export function ChannelPageHeader({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Canais de tráfego pago">
      {PAID_CHANNELS.map((channel) => (
        <Link
          key={channel.href}
          href={channel.href}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-white transition-colors ${
            active === channel.label
              ? "border-nord-blue bg-nord-blue"
              : "border-nord-border hover:border-nord-blue/60"
          }`}
        >
          <DynamicIcon name={channel.icon} size={14} />
          {channel.label}
        </Link>
      ))}
    </nav>
  );
}
