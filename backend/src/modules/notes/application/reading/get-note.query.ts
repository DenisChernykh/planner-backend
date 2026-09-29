import type { Note } from "../../domain/model";
import { requireNote } from "../../domain/rules";
import type { NotesRepository } from "../ports/notes-repository";

export class GetNoteQuery {
  constructor(private readonly repository: NotesRepository) {}

  async execute({ ownerId, noteId }: { ownerId: string; noteId: string }): Promise<Note> {
    return requireNote(await this.repository.findOwned(noteId, ownerId));
  }
}
