export function RadialProgress({
  percent,
  color = "#1464F4",
  size = 88,
  strokeWidth = 8,
  label,
  sublabel,
}: {
  percent: number;
  color?: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--nord-border)" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white text-lg font-semibold">{clamped.toFixed(0)}%</span>
        </div>
      </div>
      {label && <span className="text-xs text-white text-center leading-tight">{label}</span>}
      {sublabel && <span className="text-[11px] text-nord-gray text-center">{sublabel}</span>}
    </div>
  );
}
