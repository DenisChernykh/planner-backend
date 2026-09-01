import { Textarea } from "@/shared/ui";

type FactNoteProps = {
  note: string;
  editable: boolean;
  hasEntry: boolean;
  onChange: (note: string) => void;
  onBlur: () => void;
};

export function FactNote({ note, editable, hasEntry, onChange, onBlur }: FactNoteProps) {
  return (
    <section className="space-y-2 bg-card p-4">
      <label
        htmlFor="fact-note"
        className="text-[0.65rem] font-bold tracking-wide text-muted-foreground"
      >
        ЗАМЕТКА
      </label>
      <Textarea
        id="fact-note"
        value={note}
        disabled={!hasEntry || !editable}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder="Добавьте заметку к факту"
        maxLength={1000}
      />
      <p className="text-[0.65rem] text-muted-foreground">Сохраняется при потере фокуса.</p>
    </section>
  );
}
