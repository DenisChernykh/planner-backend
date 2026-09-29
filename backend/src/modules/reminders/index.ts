import { randomBase64Url, sha256Base64Url } from "../../platform/crypto/secure-values";
import { createPlanningOperations } from "../planning";
import { HandleReminderReplyUseCase } from "./application/answers/handle-reminder-reply.use-case";
import { RecordReminderAnswerUseCase } from "./application/answers/record-reminder-answer.use-case";
import { ConfirmTelegramLinkUseCase } from "./application/connection/confirm-telegram-link.use-case";
import { ConnectTelegramUseCase } from "./application/connection/connect-telegram.use-case";
import { DisconnectTelegramUseCase } from "./application/connection/disconnect-telegram.use-case";
import { GetChatConnectionQuery } from "./application/connection/get-chat-connection.query";
import { ValidateLinkTokenQuery } from "./application/connection/validate-link-token.query";
import { DeliverReminderUseCase } from "./application/delivery/deliver-reminder.use-case";
import { DigestMessages } from "./application/delivery/digest-messages";
import { FindMissingGoalsQuery } from "./application/delivery/find-missing-goals.query";
import { OpenReminderQuestionUseCase } from "./application/delivery/open-reminder-question.use-case";
import type { ReminderTransport } from "./application/ports/reminder-transport";
import { RunRemindersUseCase } from "./application/scheduling/run-reminders.use-case";
import { GetGoalRemindersQuery } from "./application/settings/get-goal-reminders.query";
import { GetReminderStateQuery } from "./application/settings/get-reminder-state.query";
import { SaveGoalReminderUseCase } from "./application/settings/save-goal-reminder.use-case";
import { SaveReminderSettingsUseCase } from "./application/settings/save-reminder-settings.use-case";
import { D1ReminderRepository } from "./infrastructure/d1-reminder-repository";
import { ReminderBotController } from "./presentation/bot.controller";
import { createReminderHttp } from "./presentation/http";

export function createReminderOperations(
  database: D1Database,
  transport: ReminderTransport | null,
) {
  const repository = new D1ReminderRepository(database);
  const planning = createPlanningOperations(database);
  const tokens = { random: () => randomBase64Url(24), hash: sha256Base64Url };
  const missing = new FindMissingGoalsQuery(repository, planning);
  const digest = new DigestMessages(repository, transport, missing);
  const deliver = new DeliverReminderUseCase(repository, planning, transport, digest);
  const openQuestion = new OpenReminderQuestionUseCase(repository, deliver);
  const recordAnswer = new RecordReminderAnswerUseCase(repository, planning, digest);
  const reply = new HandleReminderReplyUseCase(
    repository,
    planning,
    missing,
    openQuestion,
    recordAnswer,
  );
  const disconnect = new DisconnectTelegramUseCase(repository);
  return {
    getState: new GetReminderStateQuery(repository, transport !== null),
    getGoalReminders: new GetGoalRemindersQuery(repository, planning),
    saveSettings: new SaveReminderSettingsUseCase(repository),
    saveGoalReminder: new SaveGoalReminderUseCase(repository, planning),
    connect: new ConnectTelegramUseCase(repository, transport, tokens),
    disconnect,
    runReminders: new RunRemindersUseCase(repository, transport !== null, deliver),
    bot: new ReminderBotController(
      new ValidateLinkTokenQuery(repository, tokens),
      new ConfirmTelegramLinkUseCase(repository, tokens),
      new GetChatConnectionQuery(repository),
      disconnect,
      reply,
    ),
  };
}
export async function reminderTimeZone(database: D1Database, ownerId: string): Promise<string> {
  return (await new D1ReminderRepository(database).settings(ownerId)).timeZone;
}
export function createRemindersModule(
  createTransport: (env: CloudflareBindings) => ReminderTransport | null,
) {
  return {
    router: createReminderHttp((env) => createReminderOperations(env.DB, createTransport(env))),
  };
}
