import { Check, Hash, SlidersHorizontal, Timer } from "lucide-react";

import type { CreateGoalFormInput } from "../model/create-goal-schema";
import { type FormChoice, FormChoiceGroup } from "./form-choice-group";

type TrackingType = CreateGoalFormInput["trackingType"];

const trackingOptions: FormChoice<TrackingType>[] = [
  { value: "check", label: "Галочка", icon: Check },
  { value: "quantity", label: "Количество", icon: Hash },
  { value: "scale", label: "Шкала", icon: SlidersHorizontal },
  { value: "time", label: "Время", icon: Timer },
];

export function TrackingTypeSelector({
  value,
  onValueChange,
}: {
  value: TrackingType;
  onValueChange: (value: TrackingType) => void;
}) {
  return (
    <FormChoiceGroup
      legend="Как отмечать"
      name="trackingType"
      value={value}
      options={trackingOptions}
      onValueChange={onValueChange}
    />
  );
}
