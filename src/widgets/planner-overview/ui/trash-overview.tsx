import { ArchiveRestore } from "lucide-react";
import { Link } from "react-router";

import { useGetApiPlansMonthTrash } from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import { buttonVariants, Spinner } from "@/shared/ui";

export function TrashOverview({ month }: { month: string }) {
  const trash = useGetApiPlansMonthTrash({ month });

  return (
    <section className="mx-auto max-w-5xl px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="rounded-xl border bg-card px-5 py-8 sm:px-8 sm:py-10">
        <div className="max-w-xl space-y-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ArchiveRestore className="size-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">Корзина целей</h2>
            {trash.isPending && <Spinner aria-label="Загружаем корзину" />}
            {trash.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось загрузить корзину. Попробуйте обновить страницу.
              </p>
            )}
            {trash.data && (
              <p className="text-sm text-muted-foreground">
                Удалённых целей: {trash.data.goals.length}.
              </p>
            )}
          </div>
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
