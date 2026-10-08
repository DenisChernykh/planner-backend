import { Menu } from "@base-ui/react/menu";
import { Bell, CalendarDays, ChartNoAxesCombined, Plug, Search, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink } from "react-router";
import { useLogout } from "@/features/authentication";
import { usePlannerSearch } from "@/features/search";
import type { AuthenticatedUser } from "@/shared/api";
import { useAppRuntime } from "@/shared/lib/runtime";
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
  const search = usePlannerSearch();
  const { setOpenMobile } = useSidebar();
  const embedded = useAppRuntime() === "chatgpt";
  const logout = useLogout();
  const displayName = user.displayName ?? user.username ?? "Пользователь";
  const initial = displayName.trim().charAt(0).toUpperCase() || "П";

  return (
    <Sidebar
      className="border-r bg-sidebar"
      variant="sidebar"
      role="complementary"
      aria-label="Панель приложения"
    >
      <SidebarHeader className="px-4 pt-7 pb-5">
        <NavLink
          to={`/plans/${month}`}
          className="flex h-9 items-center gap-2.5 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
            Р
          </span>
          <span className="text-[0.95rem] font-bold tracking-tight">Ритм</span>
        </NavLink>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <nav aria-label="Основная навигация">
          <SidebarMenu className="gap-1">
            {search && (
              <SidebarMenuItem>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMobile(false);
                    search.openSearch();
                  }}
                  aria-keyshortcuts="Control+k Meta+k"
                  className={cn(
                    "flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    search.isOpen
                      ? "bg-primary-soft text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <Search className="size-4" aria-hidden="true" />
                  <span>Поиск</span>
                  <kbd className="ml-auto text-[10px] text-muted-foreground">⌘ K</kbd>
                </button>
              </SidebarMenuItem>
            )}
            <PlannerNavLink to={`/plans/${month}`} label="План" icon={CalendarDays} />
            {!embedded && (
              <PlannerNavLink
                to={`/plans/${month}/progress`}
                label="Прогресс"
                icon={ChartNoAxesCombined}
              />
            )}
            <PlannerNavLink to={`/plans/${month}/reminders`} label="Напоминания" icon={Bell} />
            <PlannerNavLink to={`/plans/${month}/trash`} label="Корзина" icon={Trash2} />
            {!embedded && (
              <PlannerNavLink to={`/plans/${month}/connections`} label="Подключения" icon={Plug} />
            )}
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t px-3 py-4">
        {embedded ? (
          <div className="px-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">{displayName}</p>
            <p className="mt-1">Ритм в ChatGPT</p>
          </div>
        ) : (
          <Menu.Root>
            <Menu.Trigger
              className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label="Открыть меню пользователя"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                {initial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{displayName}</span>
                <span className="block text-[0.68rem] text-muted-foreground">личный план</span>
              </span>
              <span aria-hidden="true" className="text-muted-foreground">
                ⌄
              </span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="top" align="start" sideOffset={6} className="z-50">
                <Menu.Popup className="min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
                  <Menu.Item
                    className="flex cursor-default items-center rounded-md px-3 py-2 text-xs outline-none data-highlighted:bg-muted"
                    onClick={() => logout.mutate()}
                    disabled={logout.isPending}
                  >
                    Выйти из Ритма
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
