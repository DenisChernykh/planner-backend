import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";

import { FactValueEditor } from "./fact-value-editor";

const scaleGoal = {
  id: "goal-1",
  ownerId: "owner-1",
  month: "2026-04",
  title: "Настроение",
  description: null,
  tracking: { type: "scale", min: 1, max: 5 },
  cadence: { period: "day" },
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  entries: [],
} as GetApiPlansMonth200GoalsItem;

describe("FactValueEditor", () => {
  it("does not enable save for an invalid scale value", () => {
    render(
      <FactValueEditor
        goal={scaleGoal}
        date="2026-04-15"
        value="2.5"
        editable
        hasEntry={false}
        savePending={false}
        deletePending={false}
        saveError={false}
        deleteError={false}
        onValueChange={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Сохранить результат и заметку" })).toBeDisabled();
  });
});
