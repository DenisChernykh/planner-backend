// A later month's source may itself be inherited in this operation. Execute one
// generation at a time so SELECT can see the previous generation's committed rules.
export function inheritanceBatches<T extends { sourceGoalId: string; goalId: string }>(
  items: T[],
): T[][] {
  let pending = items;
  const batches: T[][] = [];
  while (pending.length) {
    const targets = new Set(pending.map((item) => item.goalId));
    const ready = pending.filter((item) => !targets.has(item.sourceGoalId));
    if (!ready.length) throw new Error("Cyclic reminder inheritance");
    batches.push(ready);
    const completed = new Set(ready.map((item) => item.goalId));
    pending = pending.filter((item) => !completed.has(item.goalId));
  }
  return batches;
}
