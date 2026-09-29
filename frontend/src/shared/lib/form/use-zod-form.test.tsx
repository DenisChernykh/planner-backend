import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import { PostApiNotesBody } from "@/shared/api/generated-zod/notes/notes.zod";

import { useZodForm } from ".";

const transformedSchema = z.strictObject({
  amount: z
    .string()
    .trim()
    .transform((value) => Number(value)),
});

function TransformedForm({
  onSubmit,
}: {
  onSubmit: (value: z.output<typeof transformedSchema>) => void;
}) {
  const form = useZodForm(transformedSchema, { defaultValues: { amount: "" } });
  const rawAmount = form.watch("amount");

  expectTypeOf(rawAmount).toEqualTypeOf<string>();

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <input aria-label="Количество" {...form.register("amount")} />
      <output data-testid="raw-amount">{JSON.stringify(rawAmount)}</output>
      <button type="submit">Сохранить</button>
    </form>
  );
}

function GeneratedSchemaForm({
  onSubmit,
}: {
  onSubmit: (value: z.output<typeof PostApiNotesBody>) => void;
}) {
  const form = useZodForm(PostApiNotesBody, {
    defaultValues: { title: "", body: "" },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <input aria-label="Заголовок" {...form.register("title")} />
      <input aria-label="Текст" {...form.register("body")} />
      <button type="submit">Сохранить</button>
    </form>
  );
}

describe("useZodForm", () => {
  it("keeps Zod input in form state and submits transformed output", async () => {
    const onSubmit = vi.fn<(value: z.output<typeof transformedSchema>) => void>();
    const user = userEvent.setup();

    render(<TransformedForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Количество"), " 42 ");

    expect(screen.getByTestId("raw-amount")).toHaveTextContent('" 42 "', {
      normalizeWhitespace: false,
    });

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ amount: 42 });
  });

  it("accepts a generated Hono OpenAPI Zod schema", async () => {
    const onSubmit = vi.fn<(value: z.output<typeof PostApiNotesBody>) => void>();
    const user = userEvent.setup();

    render(<GeneratedSchemaForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Заголовок"), "План");
    await user.type(screen.getByLabelText("Текст"), "Сделать важную задачу");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      title: "План",
      body: "Сделать важную задачу",
    });
  });
});
