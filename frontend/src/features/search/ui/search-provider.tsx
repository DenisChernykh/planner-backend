import {
  createContext,
  lazy,
  type PropsWithChildren,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCurrentSession } from "@/entities/session";

const SearchDialog = lazy(() => import("./search-dialog"));
const SearchContext = createContext<{ openSearch: () => void; isOpen: boolean } | null>(null);

function SearchSession({
  ownerId,
  month,
  children,
}: PropsWithChildren<{ ownerId: string; month: string }>) {
  const [open, setOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openSearch = useCallback(() => {
    if (open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActivated(true);
    setOpen(true);
  }, [open]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.isComposing &&
        !event.defaultPrevented &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);
  const value = useMemo(() => ({ openSearch, isOpen: open }), [openSearch, open]);
  return (
    <SearchContext.Provider value={value}>
      {children}
      {activated && (
        <Suspense fallback={null}>
          <SearchDialog
            ownerId={ownerId}
            month={month}
            open={open}
            onOpenChange={setOpen}
            returnFocus={returnFocus}
          />
        </Suspense>
      )}
    </SearchContext.Provider>
  );
}

export function PlannerSearchProvider({ month, children }: PropsWithChildren<{ month: string }>) {
  const session = useCurrentSession();
  if (session.kind !== "authenticated") return children;
  return (
    <SearchSession key={session.user.id} ownerId={session.user.id} month={month}>
      {children}
    </SearchSession>
  );
}
export function usePlannerSearch() {
  return useContext(SearchContext);
}
