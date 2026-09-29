import type { Note } from "../../domain/model";
import { normalizeTitle, requireValidBody } from "../../domain/rules";
import type { NotesRepository } from "../ports/notes-repository";

export class CreateNoteUseCase {
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
