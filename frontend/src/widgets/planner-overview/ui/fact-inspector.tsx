import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";
import { Button } from "@/shared/ui";
import { getTrackingLabel } from "../model/plan-model";
import { FactInspectorDraft } from "./fact-inspector-draft";
import { trackingIconMap } from "./tracking-presentation";

type FactInspectorProps = {
  goal: GetApiPlansMonth200GoalsItem;
  date: string;
  month: string;
  today: string;
  onDateChange: (date: string) => void;
  onClose: () => void;
};

export function FactInspector({
  goal,
  date,
  month,
  today,
  onDateChange,
  onClose,
}: FactInspectorProps) {
  const entry = goal.entries.find((item) => item.date === date);
  const Icon = trackingIconMap[goal.tracking.type];
  const draftKey = JSON.stringify([entry?.value, entry?.note, entry?.updatedAt]);

  return (
    <aside
      className="flex h-full min-h-[560px] w-[320px] shrink-0 flex-col border-l bg-secondary"
      aria-label="Инспектор факта"
    >
      <header className="space-y-3 border-b bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary-soft px-2 py-1 text-[0.65rem] font-bold text-primary">
            ВЫБРАНО
          </span>
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Закрыть инспектор">
            ×
          </Button>
        </div>
        <h2 className="text-base font-bold">{goal.title}</h2>
        <p className="flex items-center gap-2 text-[0.68rem] text-muted-foreground">
          <Icon className="size-3.5" /> {getTrackingLabel(goal.tracking.type)}
        </p>
      </header>
      <FactInspectorDraft
        key={`${goal.id}-${date}-${draftKey}`}
        goal={goal}
        date={date}
        month={month}
        today={today}
        onDateChange={onDateChange}
      />
    </aside>
  );
}
