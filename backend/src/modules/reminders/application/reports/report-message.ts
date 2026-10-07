import type { ProgressGoal, ProgressOverview } from "../../../progress/public-contracts";
import type { ReportSlot } from "../../domain/progress-reports";
import type { OutgoingMessage } from "../delivery/outgoing-message";

const number = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const date = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );
function goalBlock(goal: ProgressGoal): string {
  const lines = [goal.title];
  if (goal.tracking.type === "scale")
    lines.push(
      goal.average === null
        ? "Пока нет оценок"
        : `В среднем ${number(goal.average)} из ${goal.tracking.max}`,
    );
  for (const target of goal.targets) {
    const period =
      goal.cadence.period === "day"
        ? "дней"
        : goal.cadence.period === "week"
          ? "за неделю"
          : `за месяц ${target.from.slice(0, 7)}`;
    lines.push(
      `${target.value} из ${target.target ?? target.originalTarget} ${goal.measurable ? period : `записей · ${period}`}${target.percent === null ? "" : ` · ${target.percent}%`}`,
    );
    if (target.percent !== null) {
      const filled = Math.min(10, Math.round(target.percent / 10));
      lines.push(`${"▰".repeat(filled)}${"▱".repeat(10 - filled)}`);
    }
    if (target.reduced)
      lines.push(
        `План уменьшен с ${target.originalTarget} до ${target.target}${target.accounted ? `: учитываем ${date(target.accounted.from)} – ${date(target.accounted.to)}` : ""}`,
      );
    if (target.missingPlan) lines.push("План соседнего месяца ещё не сформирован");
    if (target.overflow) lines.push(`+${target.overflow} сверх плана`);
  }
  if (goal.cadence.period === "month")
    lines.push(`За эту неделю: ${goal.measurable ? goal.met : goal.records}`);
  if (goal.tracking.type === "quantity" && goal.sum !== null)
    lines.push(`${number(goal.sum)} ${goal.tracking.unit ?? "ед."} за период`);
  if (goal.cadence.period === "day" && goal.missing)
    lines.push(`Без записи: ${goal.missing} из ${goal.eligibleDays} дней`);
  if (
    goal.comparison?.deltaPoints !== null &&
    goal.comparison?.deltaPoints !== undefined &&
    goal.measurable
  )
    lines.push(
      `${goal.comparison.deltaPoints > 0 ? "+" : ""}${goal.comparison.deltaPoints} п. п. к прошлой неделе`,
    );
  return lines.join("\n");
}
export function reportMessage(
  overview: ProgressOverview,
  slot: ReportSlot,
  appOrigin: string,
): OutgoingMessage {
  const localTime = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: overview.timeZone,
  }).format(overview.asOf);
  const formedDate = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: overview.timeZone,
  }).format(overview.asOf);
  const header = [
    `Ритм · ${slot === "wed" ? "Прогресс недели" : "Итоги недели"}`,
    `${date(overview.requested.from)} – ${date(overview.today)} · данные на ${formedDate}, ${localTime}`,
    ...(overview.startsOn ? [`Учитываем с ${date(overview.startsOn)}`] : []),
    `Подтверждено выполнений: ${overview.summary.met}`,
    "",
  ].join("\n");
  const footer = "\n\nЭто снимок на момент формирования. Сегодняшние данные ещё могут дополниться.";
  let body = header;
  let included = 0;
  if (overview.state === "no-entries")
    body += `За ${date(overview.actual?.from ?? overview.requested.from)} – ${date(overview.today)} пока нет записей.`;
  else {
    for (const goal of overview.goals) {
      const block = `${included ? "\n\n" : ""}${goalBlock(goal)}`;
      const hidden = overview.goals.length - included - 1;
      const notice = hidden ? `\n\nЕщё ${hidden} целей — в подробном отчёте` : "";
      if (body.length + block.length + footer.length + notice.length > 3500) break;
      body += block;
      included++;
    }
    if (included < overview.goals.length)
      body += `\n\nЕщё ${overview.goals.length - included} целей — в подробном отчёте`;
  }
  const path = `/plans/${overview.today.slice(0, 7)}`;
  return {
    text: `${body}${footer}`,
    buttons: [
      [
        {
          text: "Открыть прогресс",
          url: `${appOrigin}${path}/progress?period=week&anchor=${overview.requested.from}`,
        },
      ],
      [{ text: "Настроить отчёты", url: `${appOrigin}${path}/reminders?tab=reports` }],
    ],
  };
}
