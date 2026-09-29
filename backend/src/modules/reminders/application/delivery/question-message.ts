import type { GoalRecord } from "../../../planning";
import type { ReminderJob } from "../../domain/model";
import type { Button, OutgoingMessage } from "./outgoing-message";

export function questionMessage(job: ReminderJob, goal: GoalRecord): OutgoingMessage {
  const heading = `${goal.title} · ${job.localDate}`;
  const correction = job.kind === "correction" ? "Исправление записи. " : "";
  const { tracking } = goal;
  if (job.kind === "input" || job.kind === "correction") {
    const format =
      tracking.type === "time"
        ? "Введите время в формате ЧЧ:ММ."
        : tracking.type === "check"
          ? "Ответьте «да» или «нет»."
          : tracking.type === "scale"
            ? `Введите целое число от ${tracking.min} до ${tracking.max}.`
            : "Введите число.";
    return { text: `${heading}\n${correction}${format}`, forceReply: true };
  }
  const buttons: Button[][] = [];
  if (tracking.type === "check")
    buttons.push([
      { text: "Да", data: `value:${job.id}:yes` },
      { text: "Нет", data: `value:${job.id}:no` },
    ]);
  else if (tracking.type === "scale" && tracking.max - tracking.min <= 9) {
    const values = Array.from({ length: tracking.max - tracking.min + 1 }, (_, i) => ({
      text: String(i + tracking.min),
      data: `value:${job.id}:${i + tracking.min}`,
    }));
    for (let i = 0; i < values.length; i += 5) buttons.push(values.slice(i, i + 5));
  } else
    buttons.push([
      { text: tracking.type === "time" ? "Ввести время" : "Ввести число", data: `input:${job.id}` },
    ]);
  buttons.push([{ text: "Через 30 минут", data: `snooze:${job.id}` }]);
  return {
    text: `${heading}\n${tracking.type === "time" ? "Во сколько? Ответьте ЧЧ:ММ или нажмите кнопку." : "Запишем результат?"}`,
    buttons,
  };
}
