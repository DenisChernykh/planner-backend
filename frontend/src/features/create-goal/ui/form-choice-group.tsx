import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type FormChoice<T extends string> = {
  value: T;
  label: string;
  hint?: string;
  icon?: LucideIcon;
};

type FormChoiceGroupProps<T extends string> = {
  legend: string;
  name: string;
  value: T;
  options: FormChoice<T>[];
  columns?: "three" | "four";
  onValueChange: (value: T) => void;
};

export function FormChoiceGroup<T extends string>({
  legend,
  name,
  value,
  options,
  columns = "four",
  onValueChange,
}: FormChoiceGroupProps<T>) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[0.68rem] font-bold tracking-[0.09em] text-muted-foreground uppercase">
        {legend}
      </legend>
      <div
        className={cn(
          "grid gap-2",
          columns === "four" && "grid-cols-2 lg:grid-cols-4",
          columns === "three" && "grid-cols-1 sm:grid-cols-3",
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const Icon = option.icon;
          return (
            <label key={option.value} className="cursor-pointer">
              <input
                type="radio"
                className="peer sr-only"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onValueChange(option.value)}
              />
              <span
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-center text-xs font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60",
                  option.hint && "min-h-14 flex-col gap-0.5",
                  selected && "border-primary bg-primary-soft font-bold text-primary",
                  !selected && "hover:border-ring hover:bg-muted/60",
                )}
              >
                <span className="flex items-center justify-center gap-1.5">
                  {Icon && <Icon className="size-3.5" />}
                  {option.label}
                </span>
                {option.hint && (
                  <span
                    className={cn(
                      "text-[0.65rem] font-normal text-muted-foreground",
                      selected && "text-primary",
                    )}
                  >
                    {option.hint}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
