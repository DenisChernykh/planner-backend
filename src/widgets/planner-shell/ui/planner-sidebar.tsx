import { CalendarDays, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink } from "react-router";
import { LogoutButton } from "@/features/authentication";
import type { AuthenticatedUser } from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/shared/ui";

type PlannerSidebarProps = {
  month: string;
  user: AuthenticatedUser;
};

function PlannerNavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <NavLink
        to={to}
        end
        onClick={() => setOpenMobile(false)}
        className={({ isActive }) =>
          cn(
            "flex h-10 items-center gap-2.5 rounded-lg px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            isActive
              ? "bg-primary-soft font-bold text-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent",
          )
        }
      >
        <Icon className="size-4" />
        <span>{label}</span>
      </NavLink>
    </SidebarMenuItem>
  );
}

export function PlannerSidebar({ month, user }: PlannerSidebarProps) {
  const displayName = user.displayName ?? user.username ?? "Пользователь";
  const initial = displayName.trim().charAt(0).toUpperCase() || "П";

  return (
    <Sidebar className="border-r bg-sidebar" variant="sidebar">
      <SidebarHeader className="px-4 pt-7 pb-5">
        <NavLink
          to={`/plans/${month}`}
          className="flex h-9 items-center gap-2.5 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
            P
          </span>
          <span className="text-[0.95rem] font-bold tracking-tight">Planner</span>
        </NavLink>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarMenu className="gap-1">
          <PlannerNavLink to={`/plans/${month}`} label="План" icon={CalendarDays} />
          <PlannerNavLink to={`/plans/${month}/trash`} label="Корзина" icon={Trash2} />
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t px-4 py-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
            {initial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold">{displayName}</span>
            <span className="block text-[0.68rem] text-muted-foreground">личный план</span>
          </span>
        </div>
        <LogoutButton className="w-full" />
      </SidebarFooter>
    </Sidebar>
  );
}
