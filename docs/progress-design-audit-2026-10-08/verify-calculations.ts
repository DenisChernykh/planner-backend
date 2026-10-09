// Independent acceptance examples from the specification and design boards.
// Run from the repository root; no database, network or Telegram calls are made.
import { deepStrictEqual } from "node:assert";
import { writeFileSync } from "node:fs";
import { calculateMet } from "../../backend/src/modules/planning/domain/rules.ts";
import { calculateProgress } from "../../backend/src/modules/progress/domain/calculate.ts";
import type { ProgressSource, Tracking } from "../../backend/src/modules/progress/domain/model.ts";
import { reportMessage } from "../../backend/src/modules/reminders/application/reports/report-message.ts";

type Input = Parameters<typeof calculateProgress>[0];
const rule: Tracking = {
  type: "quantity",
  comparison: "atLeast",
  targetValue: 20,
  unit: "страниц",
};
const entries = (values: Record<string, boolean | number | string>, tracking: Tracking = rule) =>
  Object.entries(values).map(([date, value]) => ({
    date,
    value,
    met: calculateMet(tracking, value),
  }));
const source = (changes: Partial<ProgressSource> = {}): ProgressSource => ({
  id: "a",
  chainId: "a",
  month: "2026-10",
  title: "Любое название",
  tracking: rule,
  cadence: { period: "day" },
  entries: [],
  ...changes,
});
const calc = (sources: ProgressSource[], changes: Partial<Input> = {}) =>
  calculateProgress({
    sources,
    period: "week",
    anchor: "2026-10-07",
    today: "2026-10-07",
    startsOn: "2026-10-06",
    asOf: Date.parse("2026-10-07T16:00:00Z"),
    timeZone: "Asia/Yekaterinburg",
    ...changes,
  });
const results: {
  id: string;
  requirement: string;
  expected: unknown;
  actual: unknown;
  status: string;
}[] = [];
function check(id: string, requirement: string, expected: unknown, read: () => unknown) {
  let actual: unknown;
  try {
    actual = read();
    deepStrictEqual(actual, expected);
    results.push({ id, requirement, expected, actual, status: "pass" });
  } catch (error) {
    results.push({ id, requirement, expected, actual: actual ?? String(error), status: "fail" });
  }
}
const first = calc([
  source({ entries: entries({ "2026-10-05": 100, "2026-10-06": 25, "2026-10-07": 30 }) }),
]);
check(
  "P01",
  "§3, §4.1, К1: включительный старт и исключённая история",
  [2, 2, 55, 27.5, 100, "excluded", null],
  () => {
    const g = first.goals[0];
    return [
      g.eligibleDays,
      g.met,
      g.sum,
      g.average,
      g.targets[0].percent,
      g.days[0].state,
      g.comparison,
    ];
  },
);
const checkRule: Tracking = { type: "check" };
const six = calc(
  [
    source({
      tracking: checkRule,
      entries: entries(
        {
          "2026-10-06": true,
          "2026-10-07": true,
          "2026-10-08": false,
          "2026-10-09": true,
          "2026-10-10": true,
        },
        checkRule,
      ),
    }),
  ],
  { today: "2026-10-11" },
);
check(
  "P02",
  "§4.1, К2: четыре выполнения, false, отсутствие записи",
  [4, 5, 6, 67, 83, 1, "below", "missing"],
  () => {
    const g = six.goals[0];
    return [
      g.met,
      g.records,
      g.eligibleDays,
      g.targets[0].percent,
      g.completeness,
      g.missing,
      g.days[3].state,
      g.days[6].state,
    ];
  },
);
check(
  "P03",
  "§4.1, К6: ноль входит в среднее, отсутствие не заменяется нулём",
  [2, 1, 10, 5],
  () => {
    const g = calc([source({ entries: entries({ "2026-10-05": 0, "2026-10-06": 10 }) })], {
      startsOn: null,
    }).goals[0];
    return [g.records, g.missing, g.sum, g.average];
  },
);
for (const [i, comparison] of ["atLeast", "atMost", "equal"].entries()) {
  check(
    `P0${i + 4}`,
    `§4.2, К6: ${comparison}, граница включительна`,
    [1, i === 0 ? 2 : 6, 2],
    () => {
      const tracking: Tracking = {
        type: "quantity",
        comparison: comparison as "atLeast" | "atMost" | "equal",
        targetValue: 2,
      };
      const g = calc([
        source({
          tracking,
          entries: entries(
            { "2026-10-06": 2, "2026-10-07": comparison === "atLeast" ? 0 : 4 },
            tracking,
          ),
        }),
      ]).goals[0];
      return [g.met, g.sum, g.records];
    },
  );
}
const timeExamples: [string, Tracking, string[], boolean[]][] = [
  [
    "P07",
    { type: "time", targetStart: "23:00", targetEnd: "01:00" },
    ["23:50", "00:10", "12:00"],
    [true, true, false],
  ],
  ["P08", { type: "time", targetEnd: "23:30" }, ["23:30", "23:31"], [true, false]],
  ["P09", { type: "time", targetStart: "07:00" }, ["07:00", "06:59"], [true, false]],
];
for (const [id, tracking, values, expected] of timeExamples)
  check(id, "§4.2, К6: условия времени, в том числе через полночь", expected, () =>
    values.map((value) => calculateMet(tracking, value)),
  );
const scale: Tracking = { type: "scale", min: 1, max: 5 };
check("P10", "§4.2, К5: шкала является наблюдением", [3, 1, 5, 2, false, 0, 2, null], () => {
  const r = calc([
    source({ tracking: scale, entries: entries({ "2026-10-06": 1, "2026-10-07": 5 }, scale) }),
  ]);
  const g = r.goals[0];
  return [
    g.average,
    g.minimum,
    g.maximum,
    g.records,
    g.measurable,
    r.summary.met,
    g.targets[0].value,
    g.streak,
  ];
});
check(
  "P11",
  "§4.2: время без границ не имеет среднего и оценки успеха",
  [2, false, null, 0, null],
  () => {
    const tracking: Tracking = { type: "time" };
    const r = calc([
      source({
        tracking,
        entries: entries({ "2026-10-06": "23:50", "2026-10-07": "00:10" }, tracking),
      }),
    ]);
    const g = r.goals[0];
    return [g.records, g.measurable, g.average, r.summary.met, g.streak];
  },
);
check(
  "P12",
  "§4.3, К3: месячный план 20 → 17, исходная настройка сохранена",
  [20, 17, true, { from: "2026-10-06", to: "2026-10-31" }, 20],
  () => {
    const s = source({ cadence: { period: "month", targetOccurrences: 20 } });
    const t = calc([s], { period: "month" }).goals[0].targets[0];
    return [
      t.originalTarget,
      t.target,
      t.reduced,
      t.accounted,
      (s.cadence as { targetOccurrences: number }).targetOccurrences,
    ];
  },
);
const weekly = source({
  cadence: { period: "week", targetOccurrences: 3 },
  entries: entries({ "2026-10-06": 20, "2026-10-07": 20 }),
});
check(
  "P13",
  "§4.3, К4: в среду 2 из 3, будущие дни не пропуски",
  [2, 3, 67, 2, 0, ["future", "future", "future", "future"]],
  () => {
    const g = calc([weekly]).goals[0];
    const t = g.targets[0];
    return [
      t.value,
      t.target,
      t.percent,
      g.eligibleDays,
      g.missing,
      g.days.slice(3).map((d) => d.state),
    ];
  },
);
check("P14", "§4.3: превышение плана не теряется", [4, 3, 133, 1], () => {
  const t = calc(
    [
      source({
        ...weekly,
        entries: entries({
          "2026-10-06": 20,
          "2026-10-07": 20,
          "2026-10-08": 20,
          "2026-10-09": 20,
        }),
      }),
    ],
    { today: "2026-10-09" },
  ).goals[0].targets[0];
  return [t.value, t.target, t.percent, t.overflow];
});
check(
  "P15",
  "§4.3: недельная цель в месяце имеет строки недель и не месячный процент",
  [5, null, ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]],
  () => {
    const g = calc([weekly], { period: "month", today: "2026-10-21" }).goals[0];
    return [g.targets.length, g.comparison?.deltaPoints ?? null, g.targets.map((t) => t.from)];
  },
);
check("P16", "§4.4: ΣR/ΣD и разные даты, без суммирования единиц", [3, 4, 75, 2, 2, 2], () => {
  const r = calc([
    source({ entries: entries({ "2026-10-06": 20, "2026-10-07": 0 }) }),
    source({
      id: "b",
      chainId: "b",
      tracking: checkRule,
      entries: entries({ "2026-10-06": true }, checkRule),
    }),
    { ...weekly, id: "c", chainId: "c", entries: [] },
  ]);
  return [
    r.summary.dailyRecords,
    r.summary.dailyDays,
    r.summary.dailyPercent,
    r.summary.daysWithEntries,
    r.summary.eligibleDays,
    r.summary.met,
  ];
});
check("P17", "§4.4: при отсутствии дневных целей нет дневной заполненности", [0, 0, null], () => {
  const s = calc([weekly]).summary;
  return [s.dailyRecords, s.dailyDays, s.dailyPercent];
});
for (const [id, startsOn, anchor, expected] of [
  ["P18", "2026-10-12", "2026-10-07", "future-start"],
  ["P19", "2026-10-06", "2026-09-14", "before-start"],
] as const)
  check(id, "§3, К7: нет нулевых процентов вне периода", [expected, null, null, 0], () => {
    const r = calc([source()], { startsOn, anchor });
    return [r.state, r.actual, r.summary.dailyPercent, r.goals[0]?.targets.length ?? 0];
  });
check("P20", "§3, К7: очистка и перенос назад возвращают историю", [100, 100], () =>
  [null, "2026-10-05"].map(
    (startsOn) =>
      calc([source({ entries: entries({ "2026-10-05": 100 }) })], { startsOn }).goals[0].sum,
  ),
);
const streakSource = source({ entries: entries({ "2026-10-19": 20, "2026-10-20": 20 }) });
check(
  "P21",
  "§4.4, №27: сегодня пусто — подтверждённая серия до вчера",
  { current: 2, best: 2 },
  () => calc([streakSource], { anchor: "2026-10-21", today: "2026-10-21" }).goals[0].streak,
);
check(
  "P22",
  "§4.4, №27: явное невыполнение обрывает серию",
  { current: 0, best: 2 },
  () =>
    calc(
      [
        {
          ...streakSource,
          entries: entries({ "2026-10-19": 20, "2026-10-20": 20, "2026-10-21": 0 }),
        },
      ],
      { anchor: "2026-10-21", today: "2026-10-21" },
    ).goals[0].streak,
);
check(
  "P23",
  "§4.4, №27: отсутствие вчера и сегодня обрывает серию",
  { current: 0, best: 2 },
  () => calc([streakSource], { anchor: "2026-10-21", today: "2026-10-22" }).goals[0].streak,
);
check(
  "P24",
  "§4.4: исторический период не имеет текущей серии",
  { current: null, best: 2 },
  () => calc([streakSource], { anchor: "2026-10-21", today: "2026-10-28" }).goals[0].streak,
);
check(
  "P25",
  "§4.4: серия ограничена датой учёта",
  { current: 1, best: 1 },
  () =>
    calc([streakSource], { anchor: "2026-10-21", today: "2026-10-21", startsOn: "2026-10-20" })
      .goals[0].streak,
);
const prior = {
  "2026-10-12": 20,
  "2026-10-13": 0,
  "2026-10-14": 0,
  "2026-10-19": 20,
  "2026-10-20": 20,
  "2026-10-21": 0,
};
const comparison = calc([source({ entries: entries(prior) })], {
  anchor: "2026-10-21",
  today: "2026-10-21",
});
check(
  "P26",
  "§4.4, К15: сопоставимые дни недели и исходные числа",
  [{ from: "2026-10-12", to: "2026-10-14" }, 1, 3, 20, 2, 3],
  () => {
    const g = comparison.goals[0];
    const c = g.comparison!;
    return [c.interval, c.met, c.records, c.sum, g.met, g.eligibleDays];
  },
);
check(
  "P27",
  "§4.4, F02: 2/3 − 1/3 округляется в +33 п. п.",
  33,
  () => comparison.goals[0].comparison?.deltaPoints,
);
check(
  "P28",
  "§4.4, К15: первая неделя не сравнивается с исключённой",
  [null, "insufficient-history"],
  () => [first.goals[0].comparison, first.goals[0].comparisonReason],
);
const valuesFor = (month: string, successes: number, firstValue: number) =>
  Object.fromEntries(
    Array.from({ length: 21 }, (_, i) => [
      `${month}-${String(i + 1).padStart(2, "0")}`,
      i === 0 ? firstValue : i < successes ? 20 : 0,
    ]),
  );
const months = [
  source({
    id: "nov",
    chainId: "root",
    month: "2026-11",
    entries: entries(valuesFor("2026-11", 15, 150)),
  }),
  source({
    id: "dec",
    chainId: "root",
    month: "2026-12",
    entries: entries(valuesFor("2026-12", 18, 180)),
  }),
];
const monthly = calc(months, { period: "month", anchor: "2026-12-21", today: "2026-12-21" });
check("P29", "§4.4, №27: месяцы 18/21 и 15/21; суммы 520 и 430", [18, 21, 520, 15, 21, 430], () => {
  const g = monthly.goals[0];
  return [
    g.met,
    g.eligibleDays,
    g.sum,
    g.comparison?.met,
    g.comparison?.records,
    g.comparison?.sum,
  ];
});
check(
  "P30",
  "§4.4, F02: 18/21 − 15/21 округляется в +14 п. п.",
  14,
  () => monthly.goals[0].comparison?.deltaPoints,
);
check(
  "P31",
  "§4.4: короткий предыдущий месяц не сравнивается",
  null,
  () =>
    calc([source()], { period: "month", today: "2026-10-31", startsOn: null }).goals[0].comparison,
);
const boundary = [
  source({
    id: "sep",
    chainId: "root",
    month: "2026-09",
    cadence: { period: "week", targetOccurrences: 3 },
    entries: entries({ "2026-09-30": 20 }),
  }),
  source({
    id: "oct",
    chainId: "root",
    cadence: { period: "week", targetOccurrences: 3 },
    entries: entries({ "2026-10-01": 20 }),
  }),
];
const boundaryInput: Partial<Input> = { anchor: "2026-09-30", today: "2026-10-04", startsOn: null };
check("P32", "§4.5, К13: две части объединяются, округление один раз", [1, 2, 3, 7], () => {
  const r = calc(boundary, boundaryInput);
  const g = r.goals[0];
  return [r.goals.length, g.met, g.targets[0].target, g.eligibleDays];
});
check(
  "P33",
  "§4.5, К13: одинаковые названия без связи не объединяются",
  2,
  () =>
    calc(
      boundary.map((s) => ({ ...s, chainId: s.id, title: "Одинаково" })),
      boundaryInput,
    ).goals.length,
);
check(
  "P34",
  "§4.5, №27: разные правила разделены; сравнение отсутствует",
  [2, [null, null]],
  () => {
    const different = boundary.map((s, i) =>
      i
        ? {
            ...s,
            tracking: { ...rule, targetValue: 30 },
            entries: entries({ "2026-10-01": 20 }, { ...rule, targetValue: 30 }),
          }
        : s,
    );
    const r = calc(different, boundaryInput);
    return [r.goals.length, r.goals.map((g) => g.comparison)];
  },
);
check(
  "P35",
  "§4.5, №27: неподготовленный ноябрь — исходный план без процента",
  [1, 3, null, null, true, false],
  () => {
    const t = calc(
      [
        source({
          cadence: { period: "week", targetOccurrences: 3 },
          entries: entries({ "2026-10-27": 20 }),
        }),
      ],
      { anchor: "2026-10-28", today: "2026-10-28" },
    ).goals[0].targets[0];
    return [t.value, t.originalTarget, t.target, t.percent, t.missingPlan, t.reduced];
  },
);
check("P36", "§4.2–4.5: поведение независимо от названия; все типы × частоты", 24, () => {
  const variants: [Tracking, boolean | number | string][] = [
    [checkRule, true],
    [rule, 20],
    [{ ...rule, comparison: "atMost" }, 20],
    [{ ...rule, comparison: "equal" }, 20],
    [scale, 3],
    [{ type: "time", targetEnd: "23:30" }, "23:30"],
    [{ type: "time", targetStart: "23:00", targetEnd: "01:00" }, "00:10"],
    [{ type: "time" }, "00:10"],
  ];
  let count = 0;
  for (const [tracking, value] of variants)
    for (const cadence of [
      { period: "day" },
      { period: "week", targetOccurrences: 3 },
      { period: "month", targetOccurrences: 20 },
    ] as ProgressSource["cadence"][]) {
      const s = source({
        title: "Тренировки",
        tracking,
        cadence,
        entries: entries({ "2026-10-06": value }, tracking),
      });
      const stripTitle = (r: ReturnType<typeof calc>) => ({
        ...r,
        goals: r.goals.map(({ title, ...g }) => g),
      });
      deepStrictEqual(
        stripTitle(calc([s])),
        stripTitle(calc([{ ...s, title: "Произвольная цель" }])),
      );
      count++;
    }
  return count;
});
const origin = "https://example.com";
check(
  "P37",
  "§7.1, F12: сводка без записей ведёт в план",
  "Открыть план",
  () => reportMessage(calc([source()]), "wed", origin).buttons?.[0]?.[0]?.text,
);
check(
  "P38",
  "§7.1, К17: длинные названия, бюджет, скрытые цели, общая сумма",
  [true, true, true, true],
  () => {
    const r = calc(
      Array.from({ length: 40 }, (_, i) =>
        source({
          id: String(i),
          chainId: String(i),
          title: `Цель ${i}: <b>*_& ` + "длинное название ".repeat(8),
          entries: entries({ "2026-10-06": 20 }),
        }),
      ),
    );
    const m = reportMessage(r, "wed", origin);
    return [
      m.text.length <= 3500,
      /Ещё \d+ целей/.test(m.text),
      m.text.includes("Подтверждено выполнений: 40"),
      m.text.includes("<b>*_&"),
    ];
  },
);
check("P39", "§7.1, К4: месячный план отдельно от недельного факта", [true, true], () => {
  const s = source({
    cadence: { period: "month", targetOccurrences: 10 },
    entries: entries({
      "2026-10-01": 20,
      "2026-10-02": 20,
      "2026-10-03": 20,
      "2026-10-06": 20,
      "2026-10-07": 20,
    }),
  });
  const text = reportMessage(calc([s], { startsOn: null }), "wed", origin).text;
  return [text.includes("5 из 10 за месяц 2026-10"), text.includes("За эту неделю: 2")];
});
const result = {
  sourceRevision: process.env.ACCEPTANCE_REVISION ?? "working-tree: fix/progress-complete",
  method: "Direct domain/formatter calls on synthetic facts; no external I/O",
  totals: {
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
  },
  cases: results,
};
writeFileSync(
  new URL("./evidence/acceptance-calculations.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { totals: result.totals, failures: results.filter((r) => r.status === "fail") },
    null,
    2,
  ),
);
// Keep this outside the CI test suite: an acceptance failure must remain visible.
process.exitCode = result.totals.failed ? 1 : 0;
