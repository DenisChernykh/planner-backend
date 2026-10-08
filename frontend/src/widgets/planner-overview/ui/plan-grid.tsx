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
  useGetApiProgress,
} from "@/shared/api";
import { getPlannerMonthEnd } from "@/shared/lib/planner-calendar";
import { useAppRuntime } from "@/shared/lib/runtime";
import { Input } from "@/shared/ui";
import { formatFactDate } from "../model/plan-model";

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

export function PlanGrid({
  month,
  today,
  weekDates,
  goals,
  onSelect,
  onManage,
  selection,
}: PlanGridProps) {
  const queryClient = useQueryClient();
  const embedded = useAppRuntime() === "chatgpt";
  const progress = useGetApiProgress(
    { period: "week", anchor: weekDates[0] ?? today },
    { query: { enabled: !embedded } },
  );
  const [announcement, setAnnouncement] = useState("");
  const [reordering, setReordering] = useState(false);
  const [mobileDate, setMobileDate] = useState(today.startsWith(`${month}-`) ? today : "");
  const queryKey = getGetApiPlansMonthQueryKey({ month });

  const handleDragStart = (event: DragStartEvent) => {
    if (reordering) return setAnnouncement("Подождите, текущий порядок ещё сохраняется.");
    const source = event.operation.source;
    if (source && isSortable(source))
      setAnnouncement(`Начато перемещение цели «${String(source.data.title ?? "")}».`);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (reordering) return setAnnouncement("Подождите, текущий порядок ещё сохраняется.");
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
    setReordering(true);
    void putApiPlansMonthGoalsOrder({ month }, data)
      .then(() => setAnnouncement("Порядок целей сохранён."))
      .catch(() => {
        queryClient.setQueryData(queryKey, before);
        setAnnouncement("Не удалось сохранить порядок. Порядок восстановлен.");
      })
      .finally(async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey }),
          queryClient.invalidateQueries({
            predicate: (query) =>
              /\/api\/(?:progress|reminders\/progress-reports)/u.test(String(query.queryKey[0])),
          }),
        ]);
        setReordering(false);
      });
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
      <section
        className="rounded-xl border bg-card shadow-sm md:max-h-[70vh] md:overflow-auto"
        aria-busy={reordering}
        aria-label="Недельная таблица плана"
      >
        <div className="space-y-2 border-b bg-primary-soft p-4 md:hidden">
          <label htmlFor="mobile-result-date" className="text-sm font-semibold">
            Результаты за день
          </label>
          <Input
            id="mobile-result-date"
            type="date"
            value={mobileDate}
            min={`${month}-01`}
            max={getPlannerMonthEnd(month)}
            className="h-11 min-w-0 rounded-lg text-base md:text-base"
            onChange={(event) => setMobileDate(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {mobileDate
              ? formatFactDate(mobileDate)
              : "Выберите день месяца перед изменением результата."}
          </p>
        </div>
        <div className="min-w-0 md:min-w-[988px]" inert={reordering || undefined}>
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
              onManage={onManage}
              mobileDate={mobileDate}
              selection={selection}
              progress={progress.data?.goals}
              progressState={
                embedded
                  ? "embedded"
                  : progress.isError
                    ? "error"
                    : progress.isPending
                      ? "pending"
                      : "ready"
              }
            />
          ))}
        </div>
      </section>
    </DragDropProvider>
  );
}
