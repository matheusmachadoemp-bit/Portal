"use client";

import { DynamicIcon } from "@/components/dynamic-icon";

export const ICON_CHOICES = [
  "Home", "ShoppingCart", "Megaphone", "Target", "Users", "Building2", "ClipboardList",
  "Settings", "UserCog", "Briefcase", "Utensils", "ChefHat", "Bike", "IdCard",
  "AlertTriangle", "KeyRound", "GraduationCap", "BookOpen", "Image", "FolderOpen",
  "Pizza", "Package", "Sandwich", "Soup", "Beef", "CupSoda", "Martini", "Boxes",
  "TrendingUp", "TrendingDown", "DollarSign", "BarChart3", "PieChart", "Calendar",
  "FileText", "Star", "Award", "Bell", "Folder", "LayoutGrid", "Circle",
];

export const COLOR_CHOICES = [
  "#2952E3", "#4d70ff", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4", "#f97316",
];

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-2 max-h-40 overflow-y-auto nord-scrollbar p-1">
      {ICON_CHOICES.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={`flex items-center justify-center rounded-lg border p-2 transition ${
            value === icon
              ? "border-nord-blue bg-nord-blue/20 text-white"
              : "border-nord-border text-nord-gray hover:text-white hover:border-white/30"
          }`}
        >
          <DynamicIcon name={icon} size={16} />
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_CHOICES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 ${
            value === c ? "border-white" : "border-transparent"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded-full overflow-hidden border border-nord-border bg-transparent"
      />
    </div>
  );
}
