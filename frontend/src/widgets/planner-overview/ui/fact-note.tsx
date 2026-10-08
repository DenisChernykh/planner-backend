import { useId } from "react";
import { Textarea } from "@/shared/ui";

export function FactNote({
  note,
  editable,
  pending,
  onChange,
}: {
  note: string;
  editable: boolean;
  pending: boolean;
  onChange: (note: string) => void;
}) {
  const id = useId();
  return (
    <section className="space-y-2 border-b bg-card p-4">
      <label htmlFor={id} className="text-sm font-bold text-muted-foreground">
        ЗАМЕТКА
      </label>
      <Textarea
        id={id}
        className="text-base md:text-base"
        value={note}
        disabled={!editable || pending}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Добавьте заметку к результату"
        maxLength={1000}
      />
      <p className="text-sm text-muted-foreground">
        Результат и заметка сохраняются вместе по кнопке «Сохранить результат и заметку».
      </p>
    </section>
  );
}
