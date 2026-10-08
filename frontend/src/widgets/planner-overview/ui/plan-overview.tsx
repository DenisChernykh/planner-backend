import { useState } from "react";

import { useConsumedFragmentParameter } from "@/shared/lib/hooks";
import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@/shared/ui";
import { usePlanQuery } from "../model/use-plan-query";
import { PlanOverviewContent } from "./plan-overview-content";

export function PlanOverview({ month }: { month: string }) {
  const plan = usePlanQuery(month);
  const notice = useConsumedFragmentParameter("notice");
  const [retrying, setRetrying] = useState(false);

  if (plan.isPending) {
    return (
      <div className="flex min-h-[640px] items-center justify-center">
        <Spinner aria-label="Загружаем план" />
      </div>
    );
  }
  if (!plan.data) {
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
  return <PlanOverviewContent key={month} month={month} plan={plan.data} notice={notice} />;
}
