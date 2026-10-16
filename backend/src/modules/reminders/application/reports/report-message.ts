import type {
  ProgressReportGoal,
  ProgressReportOverview,
} from "../../../progress/public-contracts";
import { DEFAULT_SETTINGS } from "../../domain/model";
import type { ReportSlot } from "../../domain/progress-reports";
import type { MessageBlock, OutgoingMessage } from "../delivery/outgoing-message";

const numbers = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const dates = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const number = (value: number) => numbers.format(value);
const date = (value: string) => dates.format(new Date(`${value}T12:00:00Z`));
function calendar(timeZone: string) {
  return {
    date: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone }),
    time: new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone }),
  };
}
// Cache formatting machinery only. Report data is always loaded for the current job.
const calendars = new Map([[DEFAULT_SETTINGS.timeZone, calendar(DEFAULT_SETTINGS.timeZone)]]);
const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const icons = { check: "✅", quantity: "📊", scale: "🙂", time: "🕒" };
const render = (blocks: MessageBlock[], html: boolean) =>
  blocks
    .map((block) =>
      [
        ...(block.title ? [html ? `<b>${escapeHtml(block.title)}</b>` : block.title] : []),
        ...block.lines.map((line) =>
          html
            ? line.bold
              ? `<b>${escapeHtml(line.text)}</b>`
              : escapeHtml(line.text)
            : line.text,
        ),
      ].join("\n"),
    )
    .join("\n\n");

function goalBlock(goal: ProgressReportGoal): MessageBlock {
  const lines: MessageBlock["lines"] = [];
  const add = (text: string, bold = false) => lines.push({ text, bold });
  if (goal.tracking.type === "scale") {
    add(
      goal.average === null
        ? "Пока нет оценок"
        : `В среднем ${number(goal.average)} из ${goal.tracking.max}`,
      true,
    );
    if (goal.minimum !== null && goal.maximum !== null)
      add(`Диапазон оценок: ${number(goal.minimum)}–${number(goal.maximum)}`);
  }
  if (goal.tracking.type === "time" && !goal.measurable) {
    const last = goal.days.findLast((day) => typeof day.value === "string");
    add(
      last ? `Последняя запись: ${last.value} · ${date(last.date)}` : "Пока нет записей времени",
      true,
    );
    add("Без условия: время не оценивается как успех или неудача");
  }
  for (const target of goal.targets) {
    const period =
      goal.cadence.period === "day"
        ? "дней"
        : goal.cadence.period === "week"
          ? "за неделю"
          : `за месяц ${target.from.slice(0, 7)}`;
    add(
      `${target.value} из ${target.target ?? target.originalTarget} ${goal.measurable ? period : `записей · ${period}`}${target.percent === null ? "" : ` · ${target.percent}%`}`,
      true,
    );
    if (target.percent !== null) {
      const filled = Math.min(10, Math.round(target.percent / 10));
      add(`${"▰".repeat(filled)}${"▱".repeat(10 - filled)}`);
    }
    if (goal.cadence.period === "week" && target.remaining !== null)
      add(`Осталось по плану: ${target.remaining}`);
    if (target.reduced)
      add(
        `План уменьшен с ${target.originalTarget} до ${target.target}${target.accounted ? `: учитываем ${date(target.accounted.from)} – ${date(target.accounted.to)}` : ""}`,
      );
    if (target.missingPlan)
      add("План соседнего месяца ещё не сформирован. Пока показаны выполнения и исходный план.");
    if (target.overflow) add(`+${target.overflow} сверх плана`);
  }
  if (goal.cadence.period === "month")
    add(`За эту неделю: ${goal.measurable ? goal.met : goal.records}`);
  if (goal.tracking.type === "quantity") {
    if (goal.sum !== null) add(`${number(goal.sum)} ${goal.tracking.unit ?? "ед."} за период`);
    const last = goal.days.findLast((day) => typeof day.value === "number");
    if (last)
      add(
        `${date(last.date)}: ${number(Number(last.value))} ${goal.tracking.unit ?? "ед."} · условие ${goal.tracking.comparison === "atLeast" ? "≥" : goal.tracking.comparison === "atMost" ? "≤" : "="} ${number(goal.tracking.targetValue)}`,
      );
  }
  if (goal.cadence.period === "day") {
    add(`Внесено ${goal.records} из ${goal.eligibleDays} дней`);
    if (goal.missing) add(`Без записи: ${goal.missing} из ${goal.eligibleDays} дней`);
  }
  if (
    goal.comparison?.deltaPoints !== null &&
    goal.comparison?.deltaPoints !== undefined &&
    goal.measurable
  )
    add(
      `${goal.comparison.deltaPoints > 0 ? "+" : ""}${goal.comparison.deltaPoints} п. п. к прошлой неделе`,
    );
  return {
    kind: "goal",
    id: goal.id,
    icon: goal.tracking.type,
    title: `${icons[goal.tracking.type]} ${goal.title}`,
    lines,
  };
}

export function reportMessage(
  overview: ProgressReportOverview,
  slot: ReportSlot,
  appOrigin: string,
  delivery?: { scheduledAt: number; quietDelayed: boolean },
): OutgoingMessage {
  let formats = calendars.get(overview.timeZone);
  if (!formats) {
    formats = calendar(overview.timeZone);
    if (calendars.size >= 32) calendars.clear();
    calendars.set(overview.timeZone, formats);
  }
  const localTime = (at: number) => formats.time.format(at);
  const formedDate = formats.date.format(overview.asOf);
  const blocks: MessageBlock[] = [
    {
      kind: "header",
      title: `Ритм · ${slot === "wed" ? "Прогресс недели" : "Итоги недели"}`,
      lines: [
        {
          text: `${date(overview.requested.from)} – ${date(overview.today)} · данные на ${formedDate}, ${localTime(overview.asOf)}`,
        },
        ...(overview.startsOn ? [{ text: `Учитываем с ${date(overview.startsOn)}` }] : []),
        { text: `Подтверждено выполнений: ${overview.summary.met}`, bold: true },
        ...(overview.summary.dailyDays
          ? [
              {
                text: `Ежедневных записей: ${overview.summary.dailyRecords} из ${overview.summary.dailyDays} · ${overview.summary.dailyPercent}%`,
              },
            ]
          : []),
        {
          text: `Дней с записями: ${overview.summary.daysWithEntries} из ${overview.summary.eligibleDays}`,
        },
        ...(delivery?.quietDelayed
          ? [
              {
                text: `Перенос из-за тихих часов: исходное время ${date(overview.today)}, ${localTime(delivery.scheduledAt)}. Сохраняем исходную неделю; записи понедельника не входят.`,
              },
            ]
          : []),
      ],
    },
  ];
  const footer: MessageBlock = {
    kind: "notice",
    lines: [
      {
        text:
          slot === "wed"
            ? "Это снимок на момент формирования. Сегодняшние данные ещё могут дополниться."
            : "Это снимок исходной недели на момент формирования. Поздние записи за эту неделю учтены; следующая неделя не входит.",
      },
    ],
  };
  let included = 0;
  const notice = (hidden: number): MessageBlock => ({
    kind: "notice",
    lines: [{ text: `Ещё ${hidden} целей — в подробном отчёте` }],
  });
  if (overview.state === "no-entries")
    blocks.push({
      kind: "notice",
      lines: [
        {
          text: `За ${date(overview.actual?.from ?? overview.requested.from)} – ${date(overview.today)} пока нет записей. Внесите первый результат в плане.`,
        },
      ],
    });
  else {
    let prefixLength = render(blocks, true).length;
    const footerLength = render([footer], true).length;
    for (const goal of overview.goals) {
      const block = goalBlock(goal),
        hidden = overview.goals.length - included - 1;
      const blockLength = render([block], true).length;
      const candidateLength =
        prefixLength +
        2 +
        blockLength +
        (hidden ? 2 + render([notice(hidden)], true).length : 0) +
        2 +
        footerLength;
      if (candidateLength > 3500) break;
      prefixLength += 2 + blockLength;
      blocks.push(block);
      included++;
    }
    if (included < overview.goals.length) blocks.push(notice(overview.goals.length - included));
  }
  blocks.push(footer);
  for (const [blockIndex, block] of blocks.entries()) {
    block.id ??= `${block.kind}:${blockIndex}`;
    block.lines.forEach((line, lineIndex) => {
      line.id = `${block.id}:${lineIndex}`;
    });
  }
  const path = `/plans/${overview.today.slice(0, 7)}`;
  return {
    text: render(blocks, false),
    html: render(blocks, true),
    blocks,
    buttons: [
      [
        {
          text: overview.state === "no-entries" ? "Открыть план" : "Открыть прогресс",
          url:
            overview.state === "no-entries"
              ? `${appOrigin}${path}`
              : `${appOrigin}${path}/progress?period=week&anchor=${overview.requested.from}`,
        },
      ],
      [{ text: "Настроить отчёты", url: `${appOrigin}${path}/reminders?tab=reports` }],
    ],
  };
}
