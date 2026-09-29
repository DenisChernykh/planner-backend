import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { getPlannerMonthDays } from "@/shared/lib/planner-month";
import { TextField } from "@/shared/ui";

import type { CreateGoalFormInput } from "../model/create-goal-schema";
import { type FormChoice, FormChoiceGroup } from "./form-choice-group";

type CadencePeriod = CreateGoalFormInput["cadencePeriod"];

const cadenceOptions: FormChoice<CadencePeriod>[] = [
  { value: "day", label: "Каждый день", hint: "без лимита" },
  { value: "week", label: "За неделю", hint: "1–7 раз" },
  { value: "month", label: "За месяц", hint: "по дням месяца" },
];

type CadenceFieldsProps = {
  month: string;
  value: CadencePeriod;
  onValueChange: (value: CadencePeriod) => void;
  register: UseFormRegister<CreateGoalFormInput>;
  errors: FieldErrors<CreateGoalFormInput>;
};

export function CadenceFields({
  month,
  value,
  onValueChange,
  register,
  errors,
}: CadenceFieldsProps) {
  const limit = value === "week" ? 7 : getPlannerMonthDays(month);

  return (
    <section className="space-y-3">
      <FormChoiceGroup
        legend="Период"
        name="cadencePeriod"
        value={value}
        options={cadenceOptions}
        columns="three"
        onValueChange={onValueChange}
      />
      {value === "day" && (
        <p className="rounded-lg border bg-muted px-4 py-3 text-xs text-muted-foreground">
          Цель доступна для отметки каждый день выбранного месяца.
        </p>
      )}
      {value !== "day" && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted px-4 py-3">
          <div className="w-28">
            <TextField
              {...register("targetOccurrences")}
              type="number"
              min="1"
              max={limit}
              step="1"
              label={<span className="text-[0.65rem] font-bold uppercase">Повторений</span>}
              className="h-9 rounded-lg bg-card text-sm"
              error={errors.targetOccurrences?.message}
            />
          </div>
          <p className="pt-6 text-xs text-muted-foreground">
            {value === "week" ? "за каждую неделю" : `за месяц, максимум ${limit}`}
          </p>
        </div>
      )}
    </section>
  );
}
