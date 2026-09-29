function previewValues(minValue: string, maxValue: string): number[] {
  const min = Number(minValue);
  const max = Number(maxValue);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) return [];

  return [
    ...new Set(
      Array.from({ length: 5 }, (_, index) => Math.round(min + ((max - min) * index) / 4)),
    ),
  ];
}

export function ScalePreview({ min, max }: { min: string; max: string }) {
  const values = previewValues(min, max);

  return (
    <div className="space-y-1.5 sm:w-52">
      <p className="text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground uppercase">
        Предпросмотр
      </p>
      <div className="flex h-10 items-center justify-center gap-2 rounded-lg bg-muted px-2">
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground">Укажите границы</span>
        )}
        {values.map((value, index) => (
          <span
            key={value}
            className={
              index === values.length - 2
                ? "flex size-6 items-center justify-center rounded-full bg-primary text-[0.65rem] font-bold text-primary-foreground"
                : "flex size-6 items-center justify-center rounded-full border bg-card text-[0.65rem] font-semibold"
            }
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
