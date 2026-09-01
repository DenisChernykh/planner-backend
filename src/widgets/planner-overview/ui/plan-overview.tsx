import { useState } from "react";

import { useGetApiPlansMonth } from "@/shared/api";
import { useConsumedFragmentParameter } from "@/shared/lib/hooks";
import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@/shared/ui";

import { PlanOverviewContent } from "./plan-overview-content";

export function PlanOverview({ month }: { month: string }) {
  const plan = useGetApiPlansMonth({ month });
  const notice = useConsumedFragmentParameter("notice");
  const [retrying, setRetrying] = useState(false);

  if (plan.isPending) {
    return (
      <div className="flex min-h-[640px] items-center justify-center">
        <Spinner aria-label="Загружаем план" />
      </div>
    );
  }
  if (plan.isError || !plan.data) {
    const retry = async () => {
      setRetrying(true);
      await plan.refetch();
      setRetrying(false);
    };
    return (
      <section className="mx-auto max-w-5xl px-8 py-10">
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить план</AlertTitle>
          <AlertDescription>Проверьте соединение и повторите попытку.</AlertDescription>
          <Button
            variant="outline"
            className="mt-3"
            isLoading={retrying}
            loadingLabel="Повторяем"
            onClick={() => void retry()}
          >
            Повторить
          </Button>
        </Alert>
      </section>
    );
  }
  return (
    <PlanOverviewContent
      key={`${month}-${plan.data.today}`}
      month={month}
      plan={plan.data}
      notice={notice}
    />
  );
}
