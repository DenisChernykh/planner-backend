import { DateTime } from "luxon";
import { createPlanningOperations } from "../planning";
import { ProgressUseCases } from "./application/progress";
import { D1ProgressRepository } from "./infrastructure/d1-progress-repository";
import { createProgressHttp } from "./presentation/http";

export { progressOverviewSchema } from "./presentation/schemas";

export function createProgressOperations(database: D1Database) {
  return new ProgressUseCases(
    new D1ProgressRepository(database),
    createPlanningOperations(database),
  );
}
export function createProgressModule(
  timeZone: (database: D1Database, ownerId: string) => Promise<string>,
) {
  return {
    router: createProgressHttp({
      operations: createProgressOperations,
      timeZone,
      today: (now, zone) => DateTime.fromMillis(now, { zone }).toFormat("yyyy-MM-dd"),
    }),
  };
}
