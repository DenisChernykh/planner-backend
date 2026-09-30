import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  getGetApiPlansMonthQueryKey,
  getGetApiRemindersGoalsMonthQueryKey,
  useGetApiRemindersSettings,
} from "@/shared/api";
import { getCurrentPlannerMonth } from "@/shared/lib/planner-month";

/** Follow the calendar only while viewing the current plan; keep historical routes and forms in place. */
export function MonthRollover({ month }: { month: string }) {
  const settings = useGetApiRemindersSettings({ query: { refetchOnWindowFocus: true } });
  const timeZone = settings.isError ? undefined : settings.data?.settings.timeZone;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const openedAt = useRef(new Date());
  const observedMonth = useRef<string | null>(null);

  useEffect(() => {
    if (!timeZone) return;
    observedMonth.current ??= getCurrentPlannerMonth(openedAt.current, timeZone);
    const check = () => {
      const currentMonth = getCurrentPlannerMonth(new Date(), timeZone);
      if (currentMonth === observedMonth.current) return;
      const viewingPlan = pathname === `/plans/${month}`;
      const followingCalendar = month === observedMonth.current;
      if (viewingPlan && (followingCalendar || month === currentMonth)) {
        // Finish a fact edit/save before changing the page underneath the user.
        const focused = document.activeElement;
        if (
          client.isMutating() > 0 ||
          (focused instanceof HTMLElement &&
            focused.matches("input, textarea, [contenteditable='true']"))
        )
          return;
        void client.invalidateQueries({
          queryKey: getGetApiPlansMonthQueryKey({ month: currentMonth }),
        });
        void client.invalidateQueries({
          queryKey: getGetApiRemindersGoalsMonthQueryKey({ month: currentMonth }),
        });
        if (followingCalendar) void navigate(`/plans/${currentMonth}`, { replace: true });
      }
      observedMonth.current = currentMonth;
    };
    check();
    const timer = window.setInterval(check, 30_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeZone, month, pathname, client, navigate]);
  return null;
}
