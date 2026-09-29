import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";
import { Spinner } from "@/shared/ui/spinner";

/**
 * Формирует классы визуального варианта и размера общей кнопки.
 *
 * @remarks Варианты соответствуют контракту shadcn/Base UI и используются
 * компонентом `Button`, а также потребителями, которым нужны те же состояния
 * без дополнительной кнопочной обёртки.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-none px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-none px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 rounded-none [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-none",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * Рендерит кнопку registry с индикатором загрузки без изменения её ширины.
 *
 * @remarks При `isLoading` кнопка блокируется, скрывает обычный контент и
 * получает доступное имя из `loadingLabel` или значения `Загрузка`. Сохраняет
 * Base UI `render`, `nativeButton` и state-callback для `className`.
 */
function Button({
  isLoading,
  loadingLabel,
  children,
  disabled,
  "aria-label": ariaLabel,
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
    loadingLabel?: string;
  }) {
  const busy = Boolean(isLoading);
  const accessibleLabel = loadingLabel ?? "Загрузка";
  const resolvedClassName = (state: ButtonPrimitive.State) =>
    cn(
      buttonVariants({ variant, size }),
      typeof className === "function" ? className(state) : className,
      "relative",
    );

  return (
    <ButtonPrimitive
      {...props}
      data-slot="button"
      aria-busy={busy || undefined}
      aria-label={busy ? accessibleLabel : ariaLabel}
      disabled={disabled || busy}
      className={resolvedClassName}
    >
      <span data-slot="button-content" className={cn("contents", busy && "invisible")}>
        {children}
      </span>
      {busy && (
        <span
          data-slot="button-loading"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Spinner aria-hidden="true" />
        </span>
      )}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
