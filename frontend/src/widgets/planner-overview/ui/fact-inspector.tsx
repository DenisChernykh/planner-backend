import { type ReactNode, type RefObject, useEffect, useRef, useSyncExternalStore } from "react";

import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";
import { Button, Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/ui";
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

const inspectorOverlayQuery = "(max-width: 1023px)";

function subscribeToInspectorLayout(onChange: () => void) {
  const query = window.matchMedia(inspectorOverlayQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function needsInspectorOverlay() {
  return window.matchMedia(inspectorOverlayQuery).matches;
}

export function FactInspector(props: FactInspectorProps) {
  const overlay = useSyncExternalStore(
    subscribeToInspectorLayout,
    needsInspectorOverlay,
    () => false,
  );

  const panelRef = useRef<HTMLElement>(null);

  return (
    <FactInspectorDraft key={`${props.goal.id}-${props.date}`} {...props}>
      {(draft, { requestClose }) => {
        const panel = (
          <FactInspectorPanel
            goal={props.goal}
            onClose={requestClose}
            overlay={overlay}
            panelRef={panelRef}
          >
            {draft}
          </FactInspectorPanel>
        );
        if (!overlay) return panel;
        return (
          <Sheet
            open
            onOpenChange={(open) => {
              if (!open) requestClose();
            }}
          >
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] overflow-hidden rounded-t-2xl sm:mx-auto sm:max-w-md"
            >
              <SheetTitle className="sr-only">{props.goal.title} — факт за день</SheetTitle>
              <SheetDescription className="sr-only">
                Выберите дату, измените факт или добавьте заметку к цели.
              </SheetDescription>
              {panel}
            </SheetContent>
          </Sheet>
        );
      }}
    </FactInspectorDraft>
  );
}

function FactInspectorPanel({
  goal,
  onClose,
  overlay,
  panelRef,
  children,
}: Pick<FactInspectorProps, "goal" | "onClose"> & {
  overlay: boolean;
  panelRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const Icon = trackingIconMap[goal.tracking.type];
  useEffect(() => {
    if (overlay) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="alertdialog"]')) return;
      if (!panelRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [overlay, onClose, panelRef]);

  return (
    <aside
      ref={panelRef}
      className={`flex h-full flex-col bg-secondary ${overlay ? "min-h-0 w-full" : "min-h-[560px] w-[320px] shrink-0 border-l"}`}
      aria-label="Инспектор факта"
    >
      <header className="shrink-0 space-y-3 border-b bg-card p-4 lg:p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-primary-soft px-2 py-1 text-[0.65rem] font-bold text-primary">
            ВЫБРАНО
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-11 rounded-lg text-xl lg:size-6 lg:rounded-none lg:text-xs"
            onClick={onClose}
            aria-label="Закрыть инспектор"
          >
            ×
          </Button>
        </div>
        <h2 className="break-words text-base font-bold">{goal.title}</h2>
        <p className="flex items-center gap-2 text-[0.68rem] text-muted-foreground">
          <Icon className="size-3.5" /> {getTrackingLabel(goal.tracking.type)}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </aside>
  );
}
