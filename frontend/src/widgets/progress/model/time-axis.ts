const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

// Cut the clock at the largest empty arc so adjacent midnight observations stay adjacent.
// This changes only the drawing coordinates, never the criterion or stored local time.
export function clockAxis(values: string[], start?: string, end?: string) {
  const sorted = [
    ...new Set([...values, ...[start, end].filter((v): v is string => Boolean(v))].map(minutes)),
  ].sort((a, b) => a - b);
  let cut = 0,
    gap = -1;
  for (let index = 0; index < sorted.length; index++) {
    const current = sorted[index] ?? 0;
    const next = sorted[(index + 1) % sorted.length] ?? 0;
    const distance = next + (index === sorted.length - 1 ? 1440 : 0) - current;
    if (distance > gap) {
      gap = distance;
      cut = next;
    }
  }
  const unwrap = (value: string) => minutes(value) + (minutes(value) < cut ? 1440 : 0);
  const positions = sorted.map((value) => value + (value < cut ? 1440 : 0));
  const min = positions.length ? Math.floor(Math.min(...positions) / 60) * 60 : 0;
  const max = positions.length
    ? Math.max(min + 60, Math.ceil(Math.max(...positions) / 60) * 60)
    : 1440;
  const rawBands =
    start && end && start > end
      ? [
          [minutes(start), 1440],
          [0, minutes(end)],
        ]
      : start || end
        ? [[start ? minutes(start) : 0, end ? minutes(end) : 1440]]
        : [];
  const bands = rawBands.flatMap(([from = 0, to = 1440]) =>
    [0, 1440].flatMap((shift) => {
      const lower = Math.max(min, from + shift),
        upper = Math.min(max, to + shift);
      return upper > lower ? [{ from: lower, to: upper }] : [];
    }),
  );
  return { min, max, unwrap, bands };
}
