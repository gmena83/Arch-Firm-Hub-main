import { Cloud, Sun, CloudRain, Wind } from "lucide-react";
import { useLang } from "@/hooks/use-lang";

interface WeatherBadgeProps {
  buildSuitability: "green" | "yellow" | "red";
  buildSuitabilityLabel: string;
  buildSuitabilityLabelEs: string;
  temperature?: number;
  temperatureUnit?: string;
  condition?: string;
  conditionEs?: string;
  compact?: boolean;
}

export function WeatherBadge({
  buildSuitability,
  buildSuitabilityLabel,
  buildSuitabilityLabelEs,
  temperature,
  temperatureUnit,
  condition,
  conditionEs,
  compact = false,
}: WeatherBadgeProps) {
  const { lang } = useLang();

  const colors = {
    green: "bg-emerald-100 text-emerald-800 border-emerald-200",
    yellow: "bg-amber-100 text-amber-800 border-amber-200",
    red: "bg-red-100 text-red-800 border-red-200",
  };

  const dots = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    red: "bg-red-500",
  };

  const label = lang === "es" ? buildSuitabilityLabelEs : buildSuitabilityLabel;
  const cond = lang === "es" ? (conditionEs ?? condition) : condition;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[buildSuitability]}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dots[buildSuitability]}`} />
        {label}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {temperature && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sun className="w-4 h-4" />
          <span>{temperature}{temperatureUnit}</span>
          {cond && <span className="text-xs">— {cond}</span>}
        </div>
      )}
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${colors[buildSuitability]}`}>
        <span className={`w-2 h-2 rounded-full ${dots[buildSuitability]}`} />
        {label}
      </span>
    </div>
  );
}
