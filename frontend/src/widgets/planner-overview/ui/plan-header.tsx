import { BarChart3, Plus } from "lucide-react";
import { Link } from "react-router";
import { useAppRuntime } from "@/shared/lib/runtime";
import { cn } from "@/shared/lib/utils";
import { buttonVariants } from "@/shared/ui";

export function PlanHeader({ month, hasGoals }: { month: string; hasGoals: boolean }) {
  const embedded = useAppRuntime() === "chatgpt";
  const title = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-[0.68rem] font-extrabold tracking-[0.14em] text-primary uppercase">
          Месячный план
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">План на {title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasGoals
            ? "Держите ритм целей в одном спокойном обзоре."
            : "Добавьте первую цель, чтобы собрать план."}
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
        {!embedded && (
          <Link
            to={`/plans/${month}/progress?period=month&anchor=${month}-01`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 rounded-lg sm:h-8 sm:rounded-none",
            )}
          >
            <BarChart3 data-icon="inline-start" /> Итоги месяца
          </Link>
        )}
        <Link
          to={`/plans/${month}/goals/new`}
          className={cn(buttonVariants(), "h-11 rounded-lg sm:h-8 sm:rounded-none")}
        >
          <Plus data-icon="inline-start" /> Добавить цель
        </Link>
      </div>
    </header>
  );
}
