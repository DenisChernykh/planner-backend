import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { TextareaField, TextField } from "@/shared/ui";

import type { CreateGoalFormInput } from "../model/create-goal-schema";

type CommonGoalFieldsProps = {
  register: UseFormRegister<CreateGoalFormInput>;
  errors: FieldErrors<CreateGoalFormInput>;
};

const labelClassName = "text-[0.68rem] font-bold tracking-[0.09em] text-muted-foreground uppercase";

export function CommonGoalFields({ register, errors }: CommonGoalFieldsProps) {
  return (
    <div className="space-y-4">
      <TextField
        {...register("title")}
        label={<span className={labelClassName}>Название цели</span>}
        placeholder="Например, тренировка"
        autoComplete="off"
        className="h-10 rounded-lg bg-card px-3 text-sm"
        description="До 160 символов"
        error={errors.title?.message}
      />
      <TextareaField
        {...register("description")}
        label={<span className={labelClassName}>Описание · необязательно</span>}
        placeholder="Добавьте контекст, который поможет не потерять смысл цели"
        className="min-h-20 resize-y rounded-lg bg-muted px-3 py-2.5 text-sm"
        error={errors.description?.message}
      />
    </div>
  );
}
