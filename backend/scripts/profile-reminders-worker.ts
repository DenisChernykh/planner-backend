import runtime from "../src";

let queries = 0;
let messages = 0;
const environments = new WeakMap<CloudflareBindings, CloudflareBindings>();

// Local profiling fixture only. Never deployed and never uses a real bot token.
export default {
  async fetch(request: Request, env: CloudflareBindings) {
    const { now } = (await request.json()) as { now: number };
    queries = 0;
    messages = 0;
    const statements = new WeakMap<object, D1PreparedStatement>();
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
      const proxy = new Proxy(statement, {
        get(target, key) {
          if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
          if (["run", "all", "first", "raw"].includes(String(key)))
            return (...args: unknown[]) => {
              queries++;
              return Reflect.get(target, key).apply(target, args);
            };
          return Reflect.get(target, key);
        },
      });
      statements.set(proxy, statement);
      return proxy;
    };
    const database = new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare") return (sql: string) => wrap(target.prepare(sql));
        if (key === "batch")
          return (batch: D1PreparedStatement[]) => {
            queries += batch.length;
            return target.batch(batch.map((statement) => statements.get(statement) ?? statement));
          };
        return Reflect.get(target, key);
      },
    });
    let bindings = environments.get(env);
    if (!bindings) {
      bindings = { ...env, DB: database };
      environments.set(env, bindings);
    }
    const clock = Date.now;
    const originalFetch = globalThis.fetch;
    Date.now = () => now;
    globalThis.fetch = async () => {
      messages++;
      return Response.json({ ok: true, result: { message_id: messages } });
    };
    try {
      await runtime.scheduled({ cron: "* * * * *", scheduledTime: now, noRetry() {} }, bindings);
      return Response.json({ queries, messages });
    } finally {
      Date.now = clock;
      globalThis.fetch = originalFetch;
    }
  },
};
