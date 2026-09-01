import { colorForUserId } from "@/lib/user-color";

export function ResponsavelBadge({ userId, name }: { userId: string; name: string }) {
  const color = colorForUserId(userId);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: `${color}40` }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
