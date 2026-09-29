import { ApplicationError } from "../../../shared/application/application-error";
import { type GoalEntryInput, type GoalResource, PlanningError } from "../../planning";
import type { PlanningOperations } from "../../planning/public-contracts";
import { questionMessage } from "./messages";
import type {
  BotInput,
  GoalReminderInput,
  OutgoingMessage,
  ReminderJob,
  ReminderSettings,
  SettingsInput,
} from "./model";
import {
  DeliveryError,
  type LinkTokenCodec,
  type ReminderRepository,
  type ReminderTransport,
} from "./ports";
import {
  afterQuietHours,
  isReminderDay,
  localDate,
  nextOccurrence,
  validateReminder,
  validateSettings,
} from "./schedule";

const DAY = 86_400_000;
const unavailable = () => new ApplicationError("NOT_FOUND", "Вопрос или цель больше недоступны.");

export class ReminderService {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
    private readonly transport: ReminderTransport | null,
    private readonly tokens: LinkTokenCodec,
  ) {}

  async state(ownerId: string) {
    const settings = await this.repository.settings(ownerId);
    const link = await this.repository.link(ownerId);
    return {
      settings,
      connection: link?.status ?? "disconnected",
      botAvailable: this.transport !== null,
      deliveryIssues: await this.repository.deliveryIssues(ownerId),
    };
  }
  async saveSettings(ownerId: string, input: SettingsInput, now: number) {
    validateSettings(input);
    const settings = {
      ...input,
      ownerId,
      nextEveningAt: nextOccurrence(now, input.timeZone, input.eveningTime),
    };
    const reminders = (await this.repository.reminders(ownerId)).map((item) => ({
      ...item,
      nextRunAt:
        item.mode === "scheduled"
          ? nextOccurrence(now, input.timeZone, item.time, item.weekdays)
          : null,
    }));
    await this.repository.saveSettings(settings, reminders);
    return settings;
  }
  async goalSettings(ownerId: string, month: string) {
    const goals = await this.planning.list(ownerId, month);
    const settings = new Map(
      (await this.repository.reminders(ownerId)).map((item) => [item.goalId, item]),
    );
    return goals.map((goal) => {
      const item = settings.get(goal.id);
      return {
        goalId: goal.id,
        title: goal.title,
        mode: item?.mode ?? ("off" as const),
        time: item?.time ?? "09:00",
        weekdays: item?.weekdays ?? [1, 2, 3, 4, 5, 6, 7],
        nextRunAt: item?.nextRunAt ?? null,
      };
    });
  }

  async saveGoal(ownerId: string, goalId: string, input: GoalReminderInput, now: number) {
    validateReminder(input);
    if (!(await this.planning.goal(ownerId, goalId))) throw unavailable();
    const settings = await this.repository.settings(ownerId);
    const reminder = {
      ...input,
      ownerId,
      goalId,
      nextRunAt:
        input.mode === "scheduled"
          ? nextOccurrence(now, settings.timeZone, input.time, input.weekdays)
          : null,
    };
    await this.repository.saveReminder(reminder);
    return reminder;
  }
  async connect(ownerId: string, now: number) {
    if (!this.transport)
      throw new ApplicationError("DEPENDENCY_UNAVAILABLE", "Telegram-бот пока не включён.");
    const username = await this.transport.username();
    const token = this.tokens.random();
    await this.repository.createLinkToken(
      ownerId,
      await this.tokens.hash(token),
      now + 10 * 60_000,
    );
    return { url: `https://t.me/${username}?start=${token}`, expiresAt: now + 10 * 60_000 };
  }
  disconnect(ownerId: string) {
    return this.repository.disconnect(ownerId);
  }

  private makeJob(
    ownerId: string,
    goalId: string | null,
    date: string,
    kind: ReminderJob["kind"],
    eventKey: string,
    now: number,
    dueAt = now,
  ): ReminderJob {
    return {
      id: crypto.randomUUID(),
      eventKey,
      ownerId,
      goalId,
      localDate: date,
      kind,
      status: "pending",
      dueAt,
      expiresAt: now + DAY,
      leaseUntil: null,
      chatId: null,
      messageId: null,
      expectedRevision: null,
      payload: "[]",
      attempts: 0,
      createdAt: now,
    };
  }
  private async missing(
    ownerId: string,
    date: string,
    settings: ReminderSettings,
  ): Promise<GoalResource[]> {
    const goals = await this.planning.list(ownerId, date.slice(0, 7));
    const configured = new Map(
      (await this.repository.reminders(ownerId)).map((item) => [item.goalId, item]),
    );
    return goals.filter((goal) => {
      const item = configured.get(goal.id);
      return (
        item &&
        item.mode !== "off" &&
        isReminderDay(date, settings, item.weekdays) &&
        !goal.entries.some((entry) => entry.date === date)
      );
    });
  }
  async tick(now: number): Promise<void> {
    if (!this.transport) return;
    await this.repository.recover(now);
    for (const settings of await this.repository.activeSettings()) {
      if ((await this.repository.link(settings.ownerId))?.status !== "active") continue;
      const configured = await this.repository.reminders(settings.ownerId);
      for (const item of configured
        .filter((r) => r.mode === "scheduled" && r.nextRunAt !== null && r.nextRunAt <= now)
        .slice(0, 5)) {
        const previous = item.nextRunAt as number;
        const date = localDate(previous, settings.timeZone);
        const next = nextOccurrence(now, settings.timeZone, item.time, item.weekdays);
        const job =
          now - previous < DAY
            ? this.makeJob(
                settings.ownerId,
                item.goalId,
                date,
                "question",
                `scheduled:${item.goalId}:${date}`,
                now,
                afterQuietHours(now, settings),
              )
            : null;
        await this.repository.advanceGoal({ ...item, nextRunAt: next }, previous, job);
      }
      if (settings.nextEveningAt !== null && settings.nextEveningAt <= now) {
        const previous = settings.nextEveningAt;
        const date = localDate(previous, settings.timeZone);
        const job =
          now - previous < DAY
            ? this.makeJob(
                settings.ownerId,
                null,
                date,
                "digest",
                `evening:${settings.ownerId}:${date}`,
                now,
                afterQuietHours(now, settings),
              )
            : null;
        await this.repository.advanceEvening(
          settings.ownerId,
          previous,
          nextOccurrence(now, settings.timeZone, settings.eveningTime),
          job,
        );
      }
    }
    for (const job of await this.repository.due(now)) await this.deliver(job, now);
  }
  private async digest(
    job: ReminderJob,
    settings: ReminderSettings,
  ): Promise<OutgoingMessage | null> {
    const goals = await this.missing(job.ownerId, job.localDate, settings);
    if (!goals.length) return null;
    const ids = JSON.parse(job.payload) as string[];
    for (const goal of goals) if (!ids.includes(goal.id)) ids.push(goal.id);
    const visible = goals.slice(0, 30);
    await this.repository.updateJob(job.id, { payload: JSON.stringify(ids) });
    return {
      text: `Осталось заполнить · ${job.localDate}\nВыберите цель.${goals.length > 30 ? " После заполнения появятся следующие." : ""}`,
      buttons: visible.map((goal) => [
        { text: goal.title.slice(0, 60), data: `pick:${job.id}:${ids.indexOf(goal.id)}` },
      ]),
    };
  }
  async deliver(job: ReminderJob, now: number, interactive = false): Promise<void> {
    if (!this.transport || job.status !== "pending") return;
    const settings = await this.repository.settings(job.ownerId);
    const link = await this.repository.link(job.ownerId);
    if (link?.status !== "active" || (!interactive && !settings.enabled) || job.expiresAt <= now) {
      await this.repository.updateJob(job.id, { status: "cancelled" });
      return;
    }
    if (!interactive) {
      const dueAt = afterQuietHours(now, settings);
      if (dueAt > now) {
        await this.repository.updateJob(job.id, { dueAt });
        return;
      }
    }
    let message: OutgoingMessage | null;
    if (job.kind === "digest") message = await this.digest(job, settings);
    else {
      const goal = job.goalId ? await this.planning.goal(job.ownerId, job.goalId) : null;
      const entry = goal ? await this.planning.entry(job.ownerId, goal.id, job.localDate) : null;
      const rule = (await this.repository.reminders(job.ownerId)).find(
        (item) => item.goalId === job.goalId,
      );
      message =
        !goal ||
        goal.month !== job.localDate.slice(0, 7) ||
        (!interactive && (!rule || rule.mode === "off")) ||
        (entry && job.kind !== "correction")
          ? null
          : questionMessage(job, goal);
    }
    if (!message) {
      await this.repository.updateJob(job.id, { status: "cancelled" });
      return;
    }
    if (!(await this.repository.claim(job.id, now))) return;
    try {
      const messageId = await this.transport.send(link.chatId, message);
      await this.repository.updateJob(job.id, {
        status: "sent",
        chatId: link.chatId,
        messageId,
        leaseUntil: null,
      });
    } catch (error) {
      const failure = error instanceof DeliveryError ? error : new DeliveryError("unknown");
      if (failure.kind === "blocked") await this.repository.block(job.ownerId);
      await this.repository.updateJob(job.id, {
        status:
          failure.kind === "retry" && job.attempts < 4
            ? "pending"
            : failure.kind === "unknown"
              ? "unknown"
              : "failed",
        dueAt: now + Math.max(60, failure.retryAfter) * 1000,
        leaseUntil: null,
      });
      console.warn(
        JSON.stringify({
          event: "reminder_delivery_failed",
          category: failure.kind,
          jobId: job.id,
        }),
      );
    }
  }

  async receive(input: BotInput, now: number): Promise<OutgoingMessage> {
    const text = input.text?.trim();
    if (text?.startsWith("/start ")) {
      const token = text.slice(7);
      if (
        !/^[A-Za-z0-9_-]{32}$/u.test(token) ||
        !(await this.repository.hasLinkToken(await this.tokens.hash(token), now))
      ) {
        return {
          text: "Ссылка истекла или уже использована. Создайте новую в настройках Planner.",
        };
      }
      return {
        text: "Подключить этот личный чат к Planner? Подтверждайте только ссылку, которую создали сами в настройках.",
        buttons: [[{ text: "Подключить", data: `link:${token}` }]],
      };
    }
    if (input.callback?.startsWith("link:")) {
      const token = input.callback.slice(5);
      const linked =
        /^[A-Za-z0-9_-]{32}$/u.test(token) &&
        (await this.repository.consumeLinkToken(
          await this.tokens.hash(token),
          input.chatId,
          input.telegramUserId,
          now,
        ));
      return {
        text: linked
          ? "Telegram подключён. Включите напоминания и выберите цели в настройках Planner."
          : "Ссылка истекла или уже использована. Создайте новую в Planner.",
      };
    }
    const link = await this.repository.linkForChat(input.chatId, input.telegramUserId);
    if (!link) return { text: "Откройте «Напоминания» в Planner и подключите Telegram." };
    if (text === "/stop") {
      await this.repository.disconnect(link.ownerId);
      return { text: "Напоминания отключены, чат отвязан." };
    }
    if (text === "/start" || text === "/help")
      return {
        text: "Отвечайте на вопрос бота или используйте кнопки под ним. Настройки — в Planner. /stop — отключить напоминания.",
      };
    const parts = input.callback?.split(":");
    const job = parts?.[1]
      ? await this.repository.job(parts[1])
      : input.replyToMessageId !== undefined
        ? await this.repository.replyJob(input.chatId, input.replyToMessageId)
        : null;
    if (
      !job ||
      job.ownerId !== link.ownerId ||
      job.chatId !== input.chatId ||
      !["sent", "answered"].includes(job.status) ||
      now - job.createdAt > 7 * DAY
    )
      return {
        text: "Ответьте на конкретный вопрос бота. Старые или отключённые вопросы больше недоступны.",
      };
    const action = parts?.[0];
    const settings = await this.repository.settings(link.ownerId);
    if (action === "pick" && job.kind === "digest") {
      const ids = JSON.parse(job.payload) as string[];
      const index = Number(parts?.[2]);
      const goalId = Number.isInteger(index) ? ids[index] : undefined;
      const missing = await this.missing(job.ownerId, job.localDate, settings);
      if (!goalId || !missing.some((goal) => goal.id === goalId))
        return { text: "Эта цель уже заполнена или больше недоступна." };
      const child = this.makeJob(
        job.ownerId,
        goalId,
        job.localDate,
        "question",
        `pick:${input.updateId}`,
        now,
      );
      child.payload = JSON.stringify({ digestId: job.id });
      return this.openQuestion(child, now);
    }
    if (!job.goalId) return { text: "Выберите цель кнопкой под вечерним сообщением." };
    const goal = await this.planning.goal(job.ownerId, job.goalId);
    if (!goal) return { text: "Цель удалена. Запись не изменена." };
    if (action === "input" || action === "edit") {
      const existing = await this.planning.entry(job.ownerId, goal.id, job.localDate);
      if (existing && action !== "edit") return this.conflict(job);
      const child = this.makeJob(
        job.ownerId,
        goal.id,
        job.localDate,
        action === "edit" ? "correction" : "input",
        `input:${input.updateId}`,
        now,
      );
      child.expectedRevision = existing?.revision ?? null;
      child.payload = job.payload;
      return this.openQuestion(child, now);
    }
    if (action === "snooze") {
      if (await this.planning.entry(job.ownerId, goal.id, job.localDate)) return this.conflict(job);
      const child = this.makeJob(
        job.ownerId,
        goal.id,
        job.localDate,
        "question",
        `snooze:${input.updateId}`,
        now,
        afterQuietHours(now + 30 * 60_000, settings),
      );
      child.payload = job.payload;
      await this.repository.enqueue(child);
      return {
        text: `Напомню через 30 минут или после тихих часов. Дата записи: ${job.localDate}.`,
      };
    }
    if (job.status === "answered")
      return {
        text: "Ответ уже сохранён. Для замены используйте «Исправить».",
        buttons: [[{ text: "Исправить", data: `edit:${job.id}` }]],
      };
    if (action && action !== "value")
      return { text: "Неизвестная кнопка. Используйте кнопки под вопросом." };
    const raw = (action === "value" ? parts?.[2] : text)?.trim() ?? "";
    let value: GoalEntryInput;
    if (goal.tracking.type === "check") {
      if (!["yes", "no", "да", "нет"].includes(raw.toLowerCase()))
        return { text: "Ответьте «да» или «нет»." };
      value = { completed: ["yes", "да"].includes(raw.toLowerCase()) };
    } else if (goal.tracking.type === "time") {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(raw))
        return {
          text: "Нужно время в формате ЧЧ:ММ, например 07:40. Ответьте на исходный вопрос.",
        };
      value = { value: raw };
    } else {
      if (!/^-?\d+(?:[.,]\d+)?$/u.test(raw) || !Number.isFinite(Number(raw.replace(",", "."))))
        return { text: "Нужно число, например 25. Ответьте на исходный вопрос." };
      const number = Number(raw.replace(",", "."));
      if (
        goal.tracking.type === "scale" &&
        (!Number.isInteger(number) || number < goal.tracking.min || number > goal.tracking.max)
      )
        return { text: `Введите целое число от ${goal.tracking.min} до ${goal.tracking.max}.` };
      value = { value: number };
    }
    let result: "saved" | "conflict";
    try {
      result = await this.planning.recordAnswer({
        ownerId: job.ownerId,
        goalId: goal.id,
        date: job.localDate,
        value,
        expectedRevision: job.expectedRevision,
        operationId: `telegram:${input.updateId}`,
        now,
        timeZone: settings.timeZone,
      });
    } catch (error) {
      if (error instanceof PlanningError)
        return {
          text: "Цель, дата или допустимые значения изменились. Проверьте запись в Planner; ответ не сохранён.",
        };
      throw error;
    }
    if (result === "conflict") return this.conflict(job);
    await this.repository.updateJob(job.id, { status: "answered" });
    await this.refreshDigest(job, settings);
    return {
      text: `Записал: ${job.localDate}, ${goal.title} — ${"completed" in value ? (value.completed ? "да" : "нет") : value.value}.`,
      buttons: [[{ text: "Исправить", data: `edit:${job.id}` }]],
    };
  }
  private async openQuestion(child: ReminderJob, now: number): Promise<OutgoingMessage> {
    const job = await this.repository.enqueue(child);
    await this.deliver(job, now, true);
    const status = (await this.repository.job(job.id))?.status;
    return {
      text:
        status === "sent" || status === "answered"
          ? ""
          : status === "pending"
            ? "Telegram временно ограничил отправку. Повторю вопрос позже."
            : "Не удалось подтвердить отправку вопроса. Попробуйте открыть его ещё раз.",
    };
  }
  private conflict(job: ReminderJob): OutgoingMessage {
    return {
      text: `За ${job.localDate} уже есть запись или она изменилась. Я её сохранил без изменений. Чтобы заменить значение, нажмите «Исправить».`,
      buttons: [[{ text: "Исправить", data: `edit:${job.id}` }]],
    };
  }
  private async refreshDigest(job: ReminderJob, settings: ReminderSettings): Promise<void> {
    const data = JSON.parse(job.payload) as { digestId?: string };
    if (!data.digestId || !this.transport) return;
    const parent = await this.repository.job(data.digestId);
    if (!parent?.chatId || parent.messageId === null) return;
    const message = (await this.digest(parent, settings)) ?? {
      text: `Всё заполнено · ${parent.localDate}`,
    };
    try {
      await this.transport.edit(parent.chatId, parent.messageId, message);
    } catch {
      /* A deleted Telegram message must not roll back a saved entry. */
    }
  }
}
