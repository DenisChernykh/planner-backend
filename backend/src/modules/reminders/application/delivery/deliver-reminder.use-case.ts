import type { PlanningOperations } from "../../../planning/public-contracts";
import { canAskGoal, deliveryDecision, failedDeliveryChanges } from "../../domain/jobs";
import type { ReminderJob } from "../../domain/model";
import type { ReminderRepository } from "../ports/reminder-repository";
import { DeliveryError, type ReminderTransport } from "../ports/reminder-transport";
import type { DigestMessages } from "./digest-messages";
import type { OutgoingMessage } from "./outgoing-message";
import { questionMessage } from "./question-message";

export class DeliverReminderUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
    private readonly transport: ReminderTransport | null,
    private readonly digest: DigestMessages,
  ) {}

  async execute({
    job,
    now,
    interactive = false,
  }: {
    job: ReminderJob;
    now: number;
    interactive?: boolean;
  }): Promise<void> {
    if (!this.transport || job.status !== "pending") return;
    const settings = await this.repository.settings(job.ownerId);
    const link = await this.repository.link(job.ownerId);
    const decision = deliveryDecision(job, settings, link, now, interactive);
    if (decision.action === "cancel") {
      await this.repository.updateJob(job.id, { status: "cancelled" });
      return;
    }
    if (decision.action === "postpone") {
      await this.repository.updateJob(job.id, { dueAt: decision.dueAt });
      return;
    }
    let message: OutgoingMessage | null;
    if (job.kind === "digest") message = await this.digest.prepareDelivery(job, settings);
    else {
      const goal = job.goalId ? await this.planning.goal(job.ownerId, job.goalId) : null;
      const entry = goal ? await this.planning.entry(job.ownerId, goal.id, job.localDate) : null;
      const rule = job.goalId ? await this.repository.reminder(job.ownerId, job.goalId) : null;
      message =
        goal && canAskGoal(job, goal.month, entry !== null, rule ?? undefined, interactive)
          ? questionMessage(job, goal)
          : null;
    }
    if (!message) {
      await this.repository.updateJob(job.id, { status: "cancelled" });
      return;
    }
    if (!(await this.repository.claim(job.id, now))) return;
    try {
      const messageId = await this.transport.send(decision.chatId, message);
      await this.repository.updateJob(job.id, {
        status: "sent",
        chatId: decision.chatId,
        messageId,
        leaseUntil: null,
      });
    } catch (error) {
      const failure = error instanceof DeliveryError ? error : new DeliveryError("unknown");
      if (failure.kind === "blocked") await this.repository.block(job.ownerId);
      await this.repository.updateJob(
        job.id,
        failedDeliveryChanges(job, failure.kind, failure.retryAfter, now),
      );
      console.warn(
        JSON.stringify({
          event: "reminder_delivery_failed",
          category: failure.kind,
          jobId: job.id,
        }),
      );
    }
  }
}
