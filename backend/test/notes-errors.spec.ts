import { describe, expect, it } from "vitest";
import type { NotesRepository } from "../src/modules/notes/application/ports/notes-repository";
import { GetNoteQuery } from "../src/modules/notes/application/reading/get-note.query";
import { ListNotesQuery } from "../src/modules/notes/application/reading/list-notes.query";
import { CreateNoteUseCase } from "../src/modules/notes/application/writing/create-note.use-case";
import { DeleteNoteUseCase } from "../src/modules/notes/application/writing/delete-note.use-case";
import { UpdateNoteUseCase } from "../src/modules/notes/application/writing/update-note.use-case";
import {
  NoteBodyTooLongError,
  NoteNotFoundError,
  NotePatchEmptyError,
  NotesLimitInvalidError,
  NoteTitleInvalidError,
} from "../src/modules/notes/domain/errors";
import { mapNotesError } from "../src/modules/notes/presentation/problems";

const missingRepository: NotesRepository = {
  create: async (note) => note,
  deleteOwned: async () => false,
  findOwned: async () => null,
  listOwned: async () => [],
  updateOwned: async () => null,
};

describe("Notes application errors", () => {
  it("uses module-owned errors for every application invariant", async () => {
    expect(() =>
      new CreateNoteUseCase(missingRepository).execute({
        body: "Body",
        now: 1,
        ownerId: "owner",
        title: " ",
      }),
    ).toThrowError(NoteTitleInvalidError);
    expect(() =>
      new CreateNoteUseCase(missingRepository).execute({
        body: "x".repeat(10_001),
        now: 1,
        ownerId: "owner",
        title: "Title",
      }),
    ).toThrowError(NoteBodyTooLongError);
    expect(() =>
      new ListNotesQuery(missingRepository).execute({ ownerId: "owner", limit: 101 }),
    ).toThrowError(NotesLimitInvalidError);
    await expect(
      new UpdateNoteUseCase(missingRepository).execute({
        changes: {},
        noteId: "note",
        now: 1,
        ownerId: "owner",
      }),
    ).rejects.toBeInstanceOf(NotePatchEmptyError);
    await expect(
      new GetNoteQuery(missingRepository).execute({ ownerId: "owner", noteId: "note" }),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
    await expect(
      new UpdateNoteUseCase(missingRepository).execute({
        changes: { body: "Updated" },
        noteId: "note",
        now: 1,
        ownerId: "owner",
      }),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
    await expect(
      new DeleteNoteUseCase(missingRepository).execute({ ownerId: "owner", noteId: "note" }),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  it.each([
    [
      new NoteBodyTooLongError(),
      {
        code: "NOTE_BODY_TOO_LONG",
        detail: "Note body must not exceed 10000 characters.",
        status: 400,
        title: "Note body is too long",
        type: "urn:planner:problem:note-body-too-long",
      },
    ],
    [
      new NoteNotFoundError(),
      {
        code: "NOTE_NOT_FOUND",
        detail: "The note was not found.",
        status: 404,
        title: "Note not found",
        type: "urn:planner:problem:note-not-found",
      },
    ],
    [
      new NotePatchEmptyError(),
      {
        code: "NOTE_PATCH_EMPTY",
        detail: "At least one note field is required.",
        status: 400,
        title: "Note update is empty",
        type: "urn:planner:problem:note-patch-empty",
      },
    ],
    [
      new NoteTitleInvalidError(),
      {
        code: "NOTE_TITLE_INVALID",
        detail: "Note title must contain 1 to 120 characters.",
        status: 400,
        title: "Note title is invalid",
        type: "urn:planner:problem:note-title-invalid",
      },
    ],
    [
      new NotesLimitInvalidError(),
      {
        code: "NOTES_LIMIT_INVALID",
        detail: "Notes limit must be an integer from 1 to 100.",
        status: 400,
        title: "Notes limit is invalid",
        type: "urn:planner:problem:notes-limit-invalid",
      },
    ],
  ])("maps $expected.code to fixed public metadata", (error, expected) => {
    expect(mapNotesError(error)).toEqual(expected);
    expect(mapNotesError(error)?.detail).not.toBe(error.message);
  });

  it("does not map errors owned by another boundary", () => {
    expect(mapNotesError(new Error("sensitive repository failure"))).toBeUndefined();
  });
});
