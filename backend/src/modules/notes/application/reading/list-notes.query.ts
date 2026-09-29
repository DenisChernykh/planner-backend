import { NotesLimitInvalidError } from "../../domain/errors";
import type { Note } from "../../domain/model";
import type { NotesRepository } from "../ports/notes-repository";

export class ListNotesQuery {
  constructor(private readonly repository: NotesRepository) {}

  execute({ ownerId, limit }: { ownerId: string; limit: number }): Promise<Note[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new NotesLimitInvalidError();
    }
    return this.repository.listOwned(ownerId, limit);
  }
}
