import { ArrowLeft, CircleAlert } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@/shared/lib/utils";
import { buttonVariants } from "@/shared/ui";

export function NotFoundPage({ invalidMonth }: { invalidMonth?: string }) {
  const title = invalidMonth ? "Некорректный месяц" : "Страница не найдена";
  const description = invalidMonth
    ? `Значение «${invalidMonth}» должно быть в формате ГГГГ-ММ.`
    : "Проверьте адрес или вернитесь к текущему месяцу.";

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted px-5 py-10">
      <section className="w-full max-w-lg rounded-xl border bg-card p-7 sm:p-9">
        <span className="mb-5 flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <CircleAlert className="size-5" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Link to="/" className={cn(buttonVariants(), "mt-6 h-10 rounded-lg px-4")}>
          <ArrowLeft data-icon="inline-start" />К текущему плану
        </Link>
      </section>
    </main>
  );
}
