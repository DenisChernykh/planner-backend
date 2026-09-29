import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

type ContainerElement = "div" | "main" | "section";

type ContainerProps = ComponentProps<"div"> & {
  as?: ContainerElement;
};

/**
 * Ограничивает ширину page-level контента и задаёт адаптивные горизонтальные поля.
 *
 * @remarks Не добавляет vertical spacing: его задаёт экран через `className`.
 */
export function Container({ as: Component = "div", className, ...props }: ContainerProps) {
  return (
    <Component
      data-slot="container"
      className={cn("container mx-auto px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}
