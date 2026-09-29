import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@/shared/lib/utils";
import { buttonVariants } from "@/shared/ui";

type PlannerPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  backTo?: string;
  backLabel?: string;
};

export function PlannerPageHeader({
  eyebrow,
  title,
  description,
  backTo,
  backLabel = "Назад",
}: PlannerPageHeaderProps) {
  return (
    <header className="border-b bg-card px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-5xl items-start justify-between gap-6">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[0.68rem] font-extrabold tracking-[0.14em] text-primary uppercase">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {backTo && (
          <Link
            to={backTo}
            className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-lg px-3 sm:px-4")}
          >
            <ArrowLeft data-icon="inline-start" />
            {backLabel}
          </Link>
        )}
      </div>
    </header>
  );
}
