import type { ComponentProps, ReactNode } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { useFieldA11y } from "./field-a11y";
import { Input } from "./input";

type TextFieldProps = ComponentProps<"input"> & {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
};

/**
 * Рендерит текстовое поле с автоматически связанными label, description и error.
 *
 * @remarks Передаёт native props и `ref` в input, поэтому совместимо с
 * регистрацией поля через React Hook Form.
 */
export function TextField({
  label,
  description,
  error,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...inputProps
}: TextFieldProps) {
  const metadata = useFieldA11y({
    id,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    description,
    error,
  });
  const hasDescription = description !== undefined && description !== null;
  const hasError = Boolean(error);

  return (
    <Field data-invalid={metadata.isInvalid || undefined}>
      <FieldLabel htmlFor={metadata.inputId}>{label}</FieldLabel>
      <Input
        {...inputProps}
        id={metadata.inputId}
        aria-describedby={metadata.describedBy}
        aria-invalid={metadata.ariaInvalid}
      />
      {hasDescription && (
        <FieldDescription id={metadata.descriptionId}>{description}</FieldDescription>
      )}
      {hasError && (
        <FieldError id={metadata.errorId} role="alert">
          {error}
        </FieldError>
      )}
    </Field>
  );
}
