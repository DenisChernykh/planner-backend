import {
  NoteBodyTooLongError,
  NoteNotFoundError,
  NotePatchEmptyError,
  NoteTitleInvalidError,
} from "./errors";
import type { Note, NoteChanges } from "./model";

export function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length < 1 || normalized.length > 120) {
    throw new NoteTitleInvalidError();
  }
  return normalized;
}

export function requireValidBody(body: string): string {
  if (body.length > 10_000) {
    throw new NoteBodyTooLongError();
  }
  return body;
}

export function validateNoteChanges(input: NoteChanges): NoteChanges {
  if (input.title === undefined && input.body === undefined) throw new NotePatchEmptyError();
  const changes = { ...input };
  if (changes.title !== undefined) changes.title = normalizeTitle(changes.title);
  if (changes.body !== undefined) changes.body = requireValidBody(changes.body);
  return changes;
}

export function requireNote(note: Note | null): Note {
  if (!note) {
    throw new NoteNotFoundError();
  }
  return note;
}
