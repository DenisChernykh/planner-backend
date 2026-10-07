import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";

import {
  type GetApiPlansMonthTrash200GoalsItem,
  getApiProblem,
  getGetApiPlansMonthQueryKey,
  getGetApiPlansMonthTrashQueryKey,
  getGetApiRemindersGoalsMonthQueryKey,
  postApiGoalsGoalIdRestore,
  useGetApiPlansMonthTrash,
} from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import { Button, buttonVariants, Spinner } from "@/shared/ui";

function DeletedGoal({
  goal,
  month,
  highlighted,
}: {
  goal: GetApiPlansMonthTrash200GoalsItem;
  month: string;
  highlighted: boolean;
}) {
  const client = useQueryClient();
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView?.({ block: "nearest" });
      ref.current?.focus();
    }
  }, [highlighted]);
  const restore = useMutation({
    mutationFn: () => postApiGoalsGoalIdRestore({ goalId: goal.id }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetApiPlansMonthTrashQueryKey({ month }) }),
        client.invalidateQueries({ queryKey: getGetApiPlansMonthQueryKey({ month }) }),
        client.invalidateQueries({ queryKey: getGetApiRemindersGoalsMonthQueryKey({ month }) }),
      ]);
    },
  });
  return (
    <li
      ref={ref}
      tabIndex={-1}
      className={cn(
        "space-y-3 rounded-lg border p-4 outline-none sm:p-5",
        highlighted && "border-primary bg-primary-soft ring-1 ring-primary",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h3 className="break-words font-semibold">{goal.title}</h3>
          {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
          <p className="text-sm text-muted-foreground">
            Сохранённых результатов: {goal.entries.length}.
            {goal.deletedAt !== null &&
              ` Удалена ${new Date(goal.deletedAt).toLocaleDateString("ru-RU")}.`}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => restore.mutate()}
          isLoading={restore.isPending}
          loadingLabel="Восстанавливаем цель…"
          aria-label={`Восстановить цель «${goal.title}»`}
        >
          <ArchiveRestore />
          Восстановить
        </Button>
      </div>
      {restore.isError && (
        <p role="alert" className="text-sm text-destructive">
          {getApiProblem(restore.error)?.status === 404
            ? "Цель уже восстановлена или недоступна. Обновите корзину."
            : "Не удалось восстановить цель. Обновите корзину перед повторной попыткой."}
        </p>
      )}
    </li>
  );
}

export function TrashOverview({ month }: { month: string }) {
  const trash = useGetApiPlansMonthTrash({ month });
  const [params] = useSearchParams();

  return (
    <section className="mx-auto max-w-5xl px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="rounded-xl border bg-card px-5 py-8 sm:px-8 sm:py-10">
        <div className="space-y-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ArchiveRestore className="size-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">Корзина целей</h2>
            {trash.isPending && <Spinner aria-label="Загружаем корзину" />}
            {trash.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось загрузить корзину.
              </p>
            )}
            {trash.data && (
              <p className="text-sm text-muted-foreground">
                {trash.data.goals.length
                  ? `Удалённых целей: ${trash.data.goals.length}.`
                  : "Корзина пуста."}
              </p>
            )}
          </div>
          {trash.data && trash.data.goals.length > 0 && (
            <ul className="space-y-3" aria-label="Удалённые цели">
              {trash.data.goals.map((goal) => (
                <DeletedGoal
                  key={goal.id}
                  goal={goal}
                  month={month}
                  highlighted={params.get("goal") === goal.id}
                />
              ))}
            </ul>
          )}
          {!trash.isPending && (
            <Button variant="ghost" onClick={() => trash.refetch()}>
              Обновить корзину
            </Button>
          )}
          <Link
            to={`/plans/${month}`}
            className={cn(buttonVariants({ variant: "outline" }), "rounded-lg")}
          >
            К плану
          </Link>
        </div>
      </div>
    </section>
  );
}
