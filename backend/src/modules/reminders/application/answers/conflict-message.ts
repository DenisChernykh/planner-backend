import type { ReminderJob } from "../../domain/model";
import type { OutgoingMessage } from "../delivery/outgoing-message";

export function conflictMessage(job: ReminderJob): OutgoingMessage {
  return {
    text: `За ${job.localDate} уже есть запись или она изменилась. Я её сохранил без изменений. Чтобы заменить значение, нажмите «Исправить».`,
    buttons: [[{ text: "Исправить", data: `edit:${job.id}` }]],
  };
}
