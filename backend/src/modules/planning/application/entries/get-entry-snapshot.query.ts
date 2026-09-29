import type { AnswerRepository } from "../ports/answer-repository";
export class GetEntrySnapshotQuery {
  constructor(private readonly repository: AnswerRepository) {}
  execute({ ownerId, goalId, date }: { ownerId: string; goalId: string; date: string }) {
    return this.repository.entrySnapshot(ownerId, goalId, date);
  }
}
