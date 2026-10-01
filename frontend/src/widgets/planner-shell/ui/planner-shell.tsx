import type { CSSProperties, PropsWithChildren } from "react";

import { useCurrentSession } from "@/entities/session";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/shared/ui";

import { PlannerSidebar } from "./planner-sidebar";

export function PlannerShell({ month, children }: PropsWithChildren<{ month: string }>) {
  const session = useCurrentSession();
  if (session.kind !== "authenticated") return null;

  return (
    <SidebarProvider style={{ "--sidebar-width": "11rem" } as CSSProperties} className="bg-muted">
      <PlannerSidebar month={month} user={session.user} />
      <SidebarInset className="min-w-0 bg-muted">
        <div className="flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-extrabold text-primary-foreground">
              Р
            </span>
            <span className="text-sm font-bold">{formatPlannerMonth(month)}</span>
          </div>
          <SidebarTrigger aria-label="Открыть навигацию" className="size-9 rounded-lg" />
        </div>
        <div className="min-h-[calc(100svh-3.5rem)] md:min-h-svh">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
