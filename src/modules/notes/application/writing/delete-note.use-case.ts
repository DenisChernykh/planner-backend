import { NoteNotFoundError } from "../../domain/errors";
import type { NotesRepository } from "../ports/notes-repository";

export class DeleteNoteUseCase {
  constructor(private readonly repository: NotesRepository) {}

  async execute({ ownerId, noteId }: { ownerId: string; noteId: string }): Promise<void> {
    if (!(await this.repository.deleteOwned(noteId, ownerId))) {
      throw new NoteNotFoundError();
    }
  }
}
