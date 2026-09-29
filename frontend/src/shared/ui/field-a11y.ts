import { type ComponentProps, type ReactNode, useId } from "react";

type FieldA11yOptions = Pick<
  ComponentProps<"input">,
  "id" | "aria-describedby" | "aria-invalid"
> & {
  description?: ReactNode;
  error?: ReactNode;
};

/**
 * Строит стабильные id и ARIA-связи для проектных form-field композиций.
 *
 * @returns Идентификаторы description/error, итоговый `aria-describedby` и
 * invalid-состояние. Токены caller-provided `aria-describedby` объединяются с
 * generated id без повторов; наличие `error` имеет приоритет над переданным
 * `aria-invalid`.
 */
export function useFieldA11y({
  id,
  "aria-describedby": externalDescription,
  "aria-invalid": externalInvalid,
  description,
  error,
}: FieldA11yOptions) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasDescription = description !== undefined && description !== null;
  const hasError = Boolean(error);
  const descriptionId = hasDescription ? `${inputId}-description` : undefined;
  const errorId = hasError ? `${inputId}-error` : undefined;
  const describedByTokens = [
    ...(externalDescription?.split(/\s+/).filter(Boolean) ?? []),
    descriptionId,
    errorId,
  ].filter((value): value is string => value !== undefined);
  const describedBy = [...new Set(describedByTokens)].join(" ") || undefined;
  const ariaInvalid = hasError ? true : externalInvalid;
  const isInvalid =
    ariaInvalid === true ||
    ariaInvalid === "true" ||
    ariaInvalid === "grammar" ||
    ariaInvalid === "spelling";

  return {
    ariaInvalid,
    describedBy,
    descriptionId,
    errorId,
    inputId,
    isInvalid,
  };
}
