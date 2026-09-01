import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { Link } from "react-router";

import { useGetApiPlansMonth } from "@/shared/api";
import { useConsumedFragmentParameter } from "@/shared/lib/hooks";
import { cn } from "@/shared/lib/utils";
import { Alert, AlertDescription, AlertTitle, buttonVariants, Spinner } from "@/shared/ui";

export function PlanOverview({ month }: { month: string }) {
  const plan = useGetApiPlansMonth({ month });
  const notice = useConsumedFragmentParameter("notice");

  return (
    <section className="mx-auto max-w-5xl space-y-5 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      {notice === "goal-created" && (
        <Alert className="rounded-xl border-success/30 bg-success-soft text-success">
          <CheckCircle2 />
          <AlertTitle>Цель создана</AlertTitle>
          <AlertDescription className="text-success/80">
            Она уже добавлена в план на выбранный месяц.
          </AlertDescription>
        </Alert>
      )}
      <div className="rounded-xl border bg-card px-5 py-8 sm:px-8 sm:py-10">
        <div className="max-w-xl space-y-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CalendarPlus className="size-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">Соберите план на месяц</h2>
            {plan.isPending && <Spinner aria-label="Загружаем план" />}
            {plan.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось загрузить цели. Попробуйте обновить страницу.
              </p>
            )}
            {plan.data && (
              <p className="text-sm text-muted-foreground">
                Сейчас в плане целей: {plan.data.goals.length}.
              </p>
            )}
          </div>
          <Link
            to={`/plans/${month}/goals/new`}
            className={cn(buttonVariants(), "h-10 rounded-lg px-4")}
          >
            <CalendarPlus data-icon="inline-start" />
            Создать цель
          </Link>
        </div>
      </div>
    </section>
  );
}
