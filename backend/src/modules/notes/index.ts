import { GetNoteQuery } from "./application/reading/get-note.query";
import { ListNotesQuery } from "./application/reading/list-notes.query";
import { CreateNoteUseCase } from "./application/writing/create-note.use-case";
import { DeleteNoteUseCase } from "./application/writing/delete-note.use-case";
import { UpdateNoteUseCase } from "./application/writing/update-note.use-case";
import { D1NotesRepository } from "./infrastructure/d1-notes-repository";
import { createNotesHttp } from "./presentation/http";

export function createNotesUseCases(database: D1Database) {
  const repository = new D1NotesRepository(database);
  return {
    createNote: new CreateNoteUseCase(repository),
    deleteNote: new DeleteNoteUseCase(repository),
    getNote: new GetNoteQuery(repository),
    listNotes: new ListNotesQuery(repository),
    updateNote: new UpdateNoteUseCase(repository),
  };
}

export function createNotesModule() {
  return { router: createNotesHttp({ createUseCases: createNotesUseCases }) };
}
