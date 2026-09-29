import { Plus } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@/shared/lib/utils";
import { Button, buttonVariants } from "@/shared/ui";

export function FormActions({ month, pending }: { month: string; pending: boolean }) {
  return (
    <footer className="flex items-center justify-end gap-2 border-t pt-5">
      <Link
        to={`/plans/${month}`}
        className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-lg px-4")}
      >
        Отмена
      </Link>
      <Button
        type="submit"
        isLoading={pending}
        loadingLabel="Создаём цель"
        className="h-10 rounded-lg px-4"
      >
        <Plus data-icon="inline-start" />
        Создать цель
      </Button>
    </footer>
  );
}
