import {
  type GoalEntryInput,
  type GoalTracking,
  isScaleValueValid,
} from "../../../planning/public-contracts";

export function parseAnswer(
  tracking: GoalTracking,
  raw: string,
): { value: GoalEntryInput } | { error: string } {
  let value: GoalEntryInput;
  if (tracking.type === "check") {
    if (!["yes", "no", "да", "нет"].includes(raw.toLowerCase()))
      return { error: "Ответьте «да» или «нет»." };
    value = { completed: ["yes", "да"].includes(raw.toLowerCase()) };
  } else if (tracking.type === "time") {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(raw))
      return {
        error: "Нужно время в формате ЧЧ:ММ, например 07:40. Ответьте на исходный вопрос.",
      };
    value = { value: raw };
  } else {
    if (!/^-?\d+(?:[.,]\d+)?$/u.test(raw) || !Number.isFinite(Number(raw.replace(",", "."))))
      return { error: "Нужно число, например 25. Ответьте на исходный вопрос." };
    const number = Number(raw.replace(",", "."));
    if (tracking.type === "scale" && !isScaleValueValid(tracking, number))
      return { error: `Введите целое число от ${tracking.min} до ${tracking.max}.` };
    value = { value: number };
  }

  return { value };
}
