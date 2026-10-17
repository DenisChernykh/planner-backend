import { DurableObject } from "cloudflare:workers";
import runtime from "../../src";
import { createReminderRunner } from "../../src/modules/reminders";
import { createReminderTransport } from "../../src/modules/telegram-bot";

// Experiment entry point only. Production wrangler.jsonc does not reference it.
type Input = {
  mode: "cron" | "do-staged" | "do-direct";
  scenario: "report" | "rollover" | "quiet" | "question" | "ambiguous" | "expired";
  now: number;
  goals: number;
  budget?: number;
};
type Bindings = CloudflareBindings & {
  EXECUTOR: DurableObjectNamespace<LocalExecutor>;
  RESULTS: Fetcher;
};
type Metrics = { queries: number; transitions: number; observerQueries: number };

// Identical query instrumentation for both execution paths; no time measurement
// with Date.now/performance.now inside Workers (their clocks advance on I/O).
function counted(database: D1Database, metrics: Metrics): D1Database {
  const statements = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, key) {
        if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
        if (["run", "all", "first", "raw"].includes(String(key)))
          return (...args: unknown[]) => {
            metrics.queries++;
            return Reflect.get(target, key).apply(target, args);
          };
        return Reflect.get(target, key);
      },
    });
    statements.set(proxy, statement);
    return proxy;
  };
  return new Proxy(database, {
    get(target, key) {
      if (key === "prepare") return (sql: string) => wrap(target.prepare(sql));
      if (key === "batch")
        return (batch: D1PreparedStatement[]) => {
          metrics.queries += batch.length;
          return target.batch(batch.map((statement) => statements.get(statement) ?? statement));
        };
      return Reflect.get(target, key);
    },
  });
}

const currentMetrics: Metrics = { queries: 0, transitions: 0, observerQueries: 0 };
const environments = new WeakMap<Bindings, Bindings>();
function environment(env: Bindings) {
  let wrapped = environments.get(env);
  if (!wrapped) {
    wrapped = { ...env, DB: counted(env.DB, currentMetrics) };
    environments.set(env, wrapped);
  }
  return wrapped;
}

async function transition(env: Bindings, input: Input) {
  const bindings = environment(env);
  const clock = Date.now;
  Date.now = () => input.now;
  try {
    if (input.mode === "do-direct") {
      // Existing non-deferred application path: same policies and transport,
      // full preparation rather than one group per invocation. No domain fork.
      await createReminderRunner(
        bindings.DB,
        createReminderTransport("123:local-prototype-only"),
        bindings.APP_ORIGIN,
      ).execute({ now: input.now });
    } else {
      // Exact production scheduled entry point, including maintenance policy.
      await runtime.scheduled(
        { cron: "* * * * *", scheduledTime: input.now, noRetry() {} },
        bindings,
      );
    }
    currentMetrics.transitions++;
  } finally {
    Date.now = clock;
  }
}

async function finished(env: Bindings, input: Input) {
  currentMetrics.observerQueries++;
  if (input.scenario === "rollover") {
    const result = await env.DB.prepare(`SELECT
      (SELECT count(*) FROM plan_goals WHERE month = '2026-11') AS goals,
      (SELECT count(*) FROM goal_reminders r JOIN plan_goals g ON g.id = r.goal_id
        WHERE g.month = '2026-11') AS reminders,
      (SELECT count(*) FROM goal_progress_reports r JOIN plan_goals g ON g.id = r.goal_id
        WHERE g.month = '2026-11') AS selections`).first<{
      goals: number;
      reminders: number;
      selections: number;
    }>();
    return (
      result?.goals === input.goals * 2 &&
      result.reminders === input.goals * 2 &&
      result.selections === input.goals * 2
    );
  }
  return !(await env.DB.prepare(
    "SELECT 1 FROM reminder_jobs WHERE status = 'pending' AND due_at <= ? LIMIT 1",
  )
    .bind(input.now)
    .first());
}

export class LocalExecutor extends DurableObject<Bindings> {
  override async fetch(request: Request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const path = new URL(request.url).pathname;
      if (path === "/init") return new Response("Ready");
      const input = (await request.json()) as Input;
      const pending = await this.ctx.storage.get<Input>("input");
      if (path === "/start" && pending) return new Response("Already active", { status: 409 });
      if (path === "/resume" && !pending) return new Response("No pending run", { status: 409 });
      await this.ctx.storage.put("input", path === "/resume" ? { ...pending, budget: 200 } : input);
      // A real workerd alarm, not a direct call to alarm() from the test driver.
      await this.ctx.storage.setAlarm(Date.now() + 25);
      return new Response("Armed", { status: 202 });
    });
  }

  override async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const input = await this.ctx.storage.get<Input>("input");
      if (!input) return;
      Object.assign(currentMetrics, { queries: 0, transitions: 0, observerQueries: 0 });
      let done = false;
      for (let i = 0; i < (input.budget ?? 200); i++) {
        await transition(this.env, input);
        done = await finished(this.env, input);
        if (done) break;
      }
      const result = { ...currentMetrics, done };
      if (done) await this.ctx.storage.delete("input");
      else {
        // Simulate interruption at a persisted stage. The driver disposes the
        // runtime and later rearms this same object from its saved input.
        await this.ctx.storage.setAlarm(Date.now() + 3_600_000);
      }
      await this.ctx.storage.put("lastResult", result);
      await this.env.RESULTS.fetch("http://local-results/complete", {
        method: "POST",
        body: JSON.stringify(result),
      });
    });
  }
}

export default {
  async fetch(request: Request, env: Bindings) {
    const path = new URL(request.url).pathname;
    if (path === "/start" || path === "/resume" || path === "/init")
      return env.EXECUTOR.getByName("local-comparison").fetch(request);
    if (path !== "/cron") return new Response("Not found", { status: 404 });
    const input = (await request.json()) as Input;
    Object.assign(currentMetrics, { queries: 0, transitions: 0, observerQueries: 0 });
    await transition(env, input);
    // Observation is outside the CPU capture for baseline, on the Node side.
    return Response.json({ ...currentMetrics });
  },
};
