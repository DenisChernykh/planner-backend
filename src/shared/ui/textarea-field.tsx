import type { ComponentProps, ReactNode } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { useFieldA11y } from "./field-a11y";
import { Textarea } from "./textarea";

/**
 * Свойства `TextareaField` для многострочного текстового ввода в форме.
 *
 * @remarks Включает все native-свойства `textarea`, в том числе `ref` для
 * регистрации через React Hook Form.
 */
export type TextareaFieldProps = ComponentProps<"textarea"> & {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
};

/**
 * Рендерит многострочное поле с автоматически связанными label, description и error.
 *
 * @remarks Передаёт native props и `ref` в `textarea`, а также объединяет
 * caller-provided ARIA-связи с идентификаторами description и error.
 */
export function TextareaField({
  label,
  description,
  error,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...textareaProps
}: TextareaFieldProps) {
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
      <Textarea
        {...textareaProps}
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
