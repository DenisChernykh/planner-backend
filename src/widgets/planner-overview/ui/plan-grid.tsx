import { Accessibility, AutoScroller, Cursor, Feedback, PreventSelection } from "@dnd-kit/dom";
import { DragDropProvider, type DragEndEvent, type DragStartEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  type GetApiPlansMonth200,
  getGetApiPlansMonthQueryKey,
  type PutApiPlansMonthGoalsOrderBody,
  putApiPlansMonthGoalsOrder,
} from "@/shared/api";

import { PlanGridHeader } from "./plan-grid-header";
import { type PlanGridProps, planSections, reorderGoals } from "./plan-grid-model";
import { PlanSection } from "./plan-section";

const russianDndPlugins = [
  Accessibility.configure({
    announcements: {
      dragstart: () => "Перемещение цели начато.",
      dragmove: () => "Цель перемещается.",
      dragover: () => "Цель перемещена в новую позицию.",
      dragend: () => "Перемещение цели завершено.",
    },
    screenReaderInstructions: {
      draggable:
        "Для перемещения цели используйте пробел, затем стрелки. Для отмены нажмите Escape.",
    },
  }),
  AutoScroller,
  Cursor,
  Feedback,
  PreventSelection,
];

export function PlanGrid({ month, today, weekDates, goals, onSelect }: PlanGridProps) {
  const queryClient = useQueryClient();
  const [announcement, setAnnouncement] = useState("");
  const queryKey = getGetApiPlansMonthQueryKey({ month });

  const handleDragStart = (event: DragStartEvent) => {
    const source = event.operation.source;
    if (source && isSortable(source))
      setAnnouncement(`Начато перемещение цели «${String(source.data.title ?? "")}».`);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const source = event.operation.source;
    const target = event.operation.target;
    if (event.canceled || !source || !isSortable(source))
      return setAnnouncement("Перемещение отменено.");
    if (!target || !isSortable(target) || source.sortable.group !== target.sortable.group)
      return setAnnouncement("Цель можно перемещать только внутри своей группы периодичности.");
    const cadence = source.sortable.group as PlanGridProps["goals"][number]["cadence"]["period"];
    const before = queryClient.getQueryData<GetApiPlansMonth200>(queryKey);
    if (!before || source.sortable.initialIndex === source.sortable.index)
      return setAnnouncement("Порядок целей не изменён.");
    const nextGoals = reorderGoals(
      before.goals,
      cadence,
      source.sortable.initialIndex,
      source.sortable.index,
    );
    const goalIds = nextGoals
      .filter((goal) => goal.cadence.period === cadence)
      .map((goal) => goal.id);
    queryClient.setQueryData(queryKey, { ...before, goals: nextGoals });
    const data: PutApiPlansMonthGoalsOrderBody = { cadence, goalIds };
    setAnnouncement(`Цель «${String(source.data.title ?? "")}» перемещена. Сохраняем порядок.`);
    void putApiPlansMonthGoalsOrder({ month }, data)
      .then(() => setAnnouncement("Порядок целей сохранён."))
      .catch(() => {
        queryClient.setQueryData(queryKey, before);
        setAnnouncement("Не удалось сохранить порядок. Порядок восстановлен.");
      })
      .finally(() => void queryClient.invalidateQueries({ queryKey }));
  };

  return (
    <DragDropProvider
      plugins={russianDndPlugins}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <PlanGridHeader weekDates={weekDates} today={today} />
        {planSections.map((section) => (
          <PlanSection
            key={section.cadence}
            {...section}
            month={month}
            today={today}
            weekDates={weekDates}
            goals={goals}
            onSelect={onSelect}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
