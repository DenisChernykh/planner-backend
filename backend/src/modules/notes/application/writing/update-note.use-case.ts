import type { Note, NoteChanges } from "../../domain/model";
import { requireNote, validateNoteChanges } from "../../domain/rules";
import type { NotesRepository } from "../ports/notes-repository";

export class UpdateNoteUseCase {
  constructor(private readonly repository: NotesRepository) {}

  async execute(input: {
    changes: NoteChanges;
    noteId: string;
    now: number;
    ownerId: string;
  }): Promise<Note> {
    const changes = validateNoteChanges(input.changes);
    return requireNote(
      await this.repository.updateOwned(input.noteId, input.ownerId, {
        ...changes,
        updatedAt: input.now,
      }),
    );
  }
}
