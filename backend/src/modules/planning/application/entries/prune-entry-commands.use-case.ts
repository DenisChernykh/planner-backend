export class PruneEntryCommandsUseCase {
  constructor(private readonly repository: { pruneEntryCommands(now: number): Promise<void> }) {}

  execute(now: number): Promise<void> {
    return this.repository.pruneEntryCommands(now);
  }
}
