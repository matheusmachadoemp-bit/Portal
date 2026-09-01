import { DynamicIcon } from "@/components/dynamic-icon";
import { TASK_SECTOR_ICON, TASK_SECTOR_COLOR } from "@/lib/tarefas";

export function SectorBadge({ sectorKey }: { sectorKey: string }) {
  const color = TASK_SECTOR_COLOR[sectorKey] ?? "#71717a";
  const icon = TASK_SECTOR_ICON[sectorKey] ?? "MoreHorizontal";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: `${color}4D`, boxShadow: `inset 0 0 0 1px ${color}80` }}
    >
      <DynamicIcon name={icon} size={12} className="text-nord-blue-light" />
      {sectorKey}
    </span>
  );
}
