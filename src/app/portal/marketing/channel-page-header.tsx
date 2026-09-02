import Link from "next/link";

const CHANNELS = [
  { href: "/portal/marketing/instagram-organico", label: "Instagram Orgânico" },
  { href: "/portal/marketing/meta-ads", label: "Meta Ads" },
  { href: "/portal/marketing/google-ads", label: "Google Ads" },
];

export function ChannelPageHeader({ active }: { active: string }) {
  return <nav className="flex flex-wrap gap-2" aria-label="Canais de marketing">{CHANNELS.map((channel) => <Link key={channel.href} href={channel.href} className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${active === channel.label ? "border-nord-blue bg-nord-blue/15 text-white" : "border-nord-border text-nord-gray hover:border-nord-blue/60 hover:text-white"}`}>{channel.label}</Link>)}</nav>;
}
