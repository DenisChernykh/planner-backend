import { CheckCircle2 } from "lucide-react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { TextField } from "@/shared/ui";

import type { CreateGoalFormInput } from "../model/create-goal-schema";
import { ScalePreview } from "./scale-preview";

type TrackingSettingsProps = {
  trackingType: CreateGoalFormInput["trackingType"];
  register: UseFormRegister<CreateGoalFormInput>;
  errors: FieldErrors<CreateGoalFormInput>;
  scaleMin: string;
  scaleMax: string;
};

const labelClassName = "text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground uppercase";
const inputClassName = "h-10 rounded-lg bg-card px-3 text-sm";

export function TrackingSettings({
  trackingType,
  register,
  errors,
  scaleMin,
  scaleMax,
}: TrackingSettingsProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-[0.68rem] font-bold tracking-[0.09em] text-muted-foreground uppercase">
        Настройка значения
      </h2>
      <div className="rounded-lg bg-muted p-3.5 sm:p-4">
        {trackingType === "check" && (
          <div className="flex min-h-12 items-center gap-3 text-sm">
            <CheckCircle2 className="size-5 shrink-0 text-success" />
            <p>В выбранный день пользователь отмечает: выполнено или нет.</p>
          </div>
        )}
        {trackingType === "quantity" && (
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_7rem]">
            <label className="space-y-1.5">
              <span className={labelClassName}>Условие</span>
              <select
                {...register("comparison")}
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="atLeast">Не меньше</option>
                <option value="atMost">Не больше</option>
                <option value="equal">Ровно</option>
              </select>
            </label>
            <TextField
              {...register("targetValue")}
              type="number"
              step="any"
              label={<span className={labelClassName}>Значение</span>}
              className={inputClassName}
              error={errors.targetValue?.message}
            />
            <TextField
              {...register("unit")}
              label={<span className={labelClassName}>Единица</span>}
              placeholder="мл"
              className={inputClassName}
              error={errors.unit?.message}
            />
          </div>
        )}
        {trackingType === "scale" && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <TextField
              {...register("scaleMin")}
              type="number"
              step="1"
              label={<span className={labelClassName}>Минимум</span>}
              className={inputClassName}
              error={errors.scaleMin?.message}
            />
            <TextField
              {...register("scaleMax")}
              type="number"
              step="1"
              label={<span className={labelClassName}>Максимум</span>}
              className={inputClassName}
              error={errors.scaleMax?.message}
            />
            <ScalePreview min={scaleMin} max={scaleMax} />
          </div>
        )}
        {trackingType === "time" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              {...register("targetStart")}
              type="time"
              label={<span className={labelClassName}>Не раньше · необязательно</span>}
              className={inputClassName}
              error={errors.targetStart?.message}
            />
            <TextField
              {...register("targetEnd")}
              type="time"
              label={<span className={labelClassName}>Не позже · необязательно</span>}
              className={inputClassName}
              error={errors.targetEnd?.message}
            />
          </div>
        )}
      </div>
    </section>
  );
}
