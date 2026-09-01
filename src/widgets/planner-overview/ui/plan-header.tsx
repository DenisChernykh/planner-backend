import { BarChart3, Plus } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@/shared/lib/utils";
import { Button, buttonVariants } from "@/shared/ui";

export function PlanHeader({ month, hasGoals }: { month: string; hasGoals: boolean }) {
  const title = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  return (
    <header className="mb-6 flex items-start justify-between gap-6">
      <div>
        <p className="text-[0.68rem] font-extrabold tracking-[0.14em] text-primary uppercase">
          Месячный план
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">План на {title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasGoals
            ? "Держите ритм целей в одном спокойном обзоре."
            : "Добавьте первую цель, чтобы собрать план."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled title="Недоступно: отчёты ещё не подключены">
          <BarChart3 data-icon="inline-start" /> Итоги месяца
        </Button>
        <Link to={`/plans/${month}/goals/new`} className={cn(buttonVariants(), "h-8")}>
          <Plus data-icon="inline-start" /> Добавить цель
        </Link>
      </div>
    </header>
  );
}
