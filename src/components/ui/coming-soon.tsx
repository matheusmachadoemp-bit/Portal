import { DynamicIcon } from "@/components/dynamic-icon";

export function ComingSoon({ icon = "Clock", title, description }: { icon?: string; title: string; description?: string }) {
  return (
    <div className="nord-card p-10 flex flex-col items-center justify-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-nord-blue/15 flex items-center justify-center">
        <DynamicIcon name={icon} size={26} className="text-nord-blue-light" />
      </div>
      <h3 className="text-white font-medium text-base">{title}</h3>
      {description && <p className="text-sm text-nord-gray max-w-sm">{description}</p>}
      <span className="text-xs text-nord-gray/70">Em breve</span>
    </div>
  );
}
