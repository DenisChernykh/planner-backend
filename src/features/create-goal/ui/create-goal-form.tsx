import { useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";

import { getGetApiPlansMonthQueryKey, usePostApiPlansMonthGoals } from "@/shared/api";
import { useZodForm } from "@/shared/lib/form";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui";

import {
  type CreateGoalFormInput,
  createGoalDefaultValues,
  createGoalFormSchema,
} from "../model/create-goal-schema";
import { CadenceFields } from "./cadence-fields";
import { CommonGoalFields } from "./common-goal-fields";
import { FormActions } from "./form-actions";
import { TrackingSettings } from "./tracking-settings";
import { TrackingTypeSelector } from "./tracking-type-selector";

const trackingFields = [
  "comparison",
  "targetValue",
  "unit",
  "scaleMin",
  "scaleMax",
  "targetStart",
  "targetEnd",
] as const satisfies readonly (keyof CreateGoalFormInput)[];

const branchFields: Record<
  CreateGoalFormInput["trackingType"],
  readonly (keyof CreateGoalFormInput)[]
> = {
  check: [],
  quantity: ["comparison", "targetValue", "unit"],
  scale: ["scaleMin", "scaleMax"],
  time: ["targetStart", "targetEnd"],
};

export function CreateGoalForm({ month }: { month: string }) {
  const schema = useMemo(() => createGoalFormSchema(month), [month]);
  const form = useZodForm(schema, { defaultValues: createGoalDefaultValues });
  const trackingType = useWatch({ control: form.control, name: "trackingType" });
  const cadencePeriod = useWatch({ control: form.control, name: "cadencePeriod" });
  const [scaleMin, scaleMax] = useWatch({
    control: form.control,
    name: ["scaleMin", "scaleMax"],
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = usePostApiPlansMonthGoals({
    mutation: {
      throwOnError: false,
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetApiPlansMonthQueryKey({ month }) });
        void navigate(`/plans/${month}#notice=goal-created`, { replace: true });
      },
    },
  });

  const selectTracking = (next: CreateGoalFormInput["trackingType"]) => {
    form.setValue("trackingType", next, { shouldDirty: true, shouldValidate: true });
    for (const field of trackingFields) {
      if (!branchFields[next].includes(field)) form.resetField(field);
    }
  };

  const selectCadence = (next: CreateGoalFormInput["cadencePeriod"]) => {
    form.setValue("cadencePeriod", next, { shouldDirty: true, shouldValidate: true });
    if (next === "day") form.resetField("targetOccurrences");
  };

  const submit = form.handleSubmit((data) => {
    mutation.reset();
    mutation.mutate({ pathParams: { month }, data });
  });

  return (
    <section className="mx-auto max-w-5xl px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <form
        noValidate
        onSubmit={submit}
        className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-5 sm:p-7"
      >
        <div className="flex items-center gap-3 border-b pb-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Target className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold">Параметры цели</h2>
            <p className="text-xs text-muted-foreground">Все поля можно изменить до создания.</p>
          </div>
        </div>
        <CommonGoalFields register={form.register} errors={form.formState.errors} />
        <TrackingTypeSelector value={trackingType} onValueChange={selectTracking} />
        <TrackingSettings
          trackingType={trackingType}
          register={form.register}
          errors={form.formState.errors}
          scaleMin={scaleMin}
          scaleMax={scaleMax}
        />
        <CadenceFields
          month={month}
          value={cadencePeriod}
          onValueChange={selectCadence}
          register={form.register}
          errors={form.formState.errors}
        />
        {mutation.isError && (
          <Alert variant="destructive" className="rounded-lg" role="alert">
            <AlertTitle>Не удалось создать цель</AlertTitle>
            <AlertDescription>
              Проверьте соединение и повторите попытку. Введённые значения сохранены.
            </AlertDescription>
          </Alert>
        )}
        <FormActions month={month} pending={mutation.isPending} />
      </form>
    </section>
  );
}
