import { NoteNotFoundError, NotesLimitInvalidError } from "../domain/errors";
import type { Note, NoteChanges } from "../domain/model";
import { normalizeTitle, requireValidBody, validateNoteChanges } from "../domain/rules";
import type { NotesRepository } from "./ports";

function requireNote(note: Note | null): Note {
  if (!note) {
    throw new NoteNotFoundError();
  }
  return note;
}

export class CreateNote {
  constructor(private readonly repository: NotesRepository) {}

  execute(input: { body: string; now: number; ownerId: string; title: string }): Promise<Note> {
    return this.repository.create({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      title: normalizeTitle(input.title),
      body: requireValidBody(input.body),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
}

export class ListNotes {
  constructor(private readonly repository: NotesRepository) {}

  execute(ownerId: string, limit: number): Promise<Note[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new NotesLimitInvalidError();
    }
    return this.repository.listOwned(ownerId, limit);
  }
}

export class GetNote {
  constructor(private readonly repository: NotesRepository) {}

  async execute(ownerId: string, noteId: string): Promise<Note> {
    return requireNote(await this.repository.findOwned(noteId, ownerId));
  }
}

export class UpdateNote {
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

export class DeleteNote {
  constructor(private readonly repository: NotesRepository) {}

  async execute(ownerId: string, noteId: string): Promise<void> {
    if (!(await this.repository.deleteOwned(noteId, ownerId))) {
      throw new NoteNotFoundError();
    }
  }
}
