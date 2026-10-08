import type { OutgoingMessage } from "./outgoing-message";

export function formatDigest(input: {
  jobId: string;
  date: string;
  previousIds: string[];
  goals: { id: string; title: string }[];
}): { ids: string[]; message: OutgoingMessage | null } {
  const ids = [...input.previousIds];
  for (const goal of input.goals) if (!ids.includes(goal.id)) ids.push(goal.id);
  return {
    ids,
    message: input.goals.length
      ? {
          text: `Осталось заполнить · ${input.date}\nВыберите цель.${input.goals.length > 30 ? " После заполнения появятся следующие." : ""}`,
          buttons: input.goals.slice(0, 30).map((goal) => [
            {
              text: goal.title.slice(0, 60),
              data: `pick:${input.jobId}:${ids.indexOf(goal.id)}`,
            },
          ]),
        }
      : null,
  };
}
