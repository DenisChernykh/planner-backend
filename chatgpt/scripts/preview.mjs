import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createWorker } from "../src/worker.ts";

// Isolated browser smoke: fixtures only, never a call to the hosted app.
const ui = await readFile(new URL("../dist/ui.html", import.meta.url), "utf8");
const accountId = "00000000-0000-4000-8000-000000000001";
const today = "2026-10-01";
const now = Date.now();
const settings = {
  ownerId: accountId,
  enabled: false,
  timeZone: "Asia/Yekaterinburg",
  quietStart: "23:00",
  quietEnd: "08:00",
  eveningTime: "21:00",
  nextEveningAt: null,
};
const goals = [
  {
    title: "Вода",
    tracking: { type: "quantity", unit: "мл", targetValue: 2000, comparison: "atLeast" },
    value: 900,
  },
  { title: "Чтение", tracking: { type: "check" }, value: true },
  { title: "Настроение", tracking: { type: "scale", min: 1, max: 10 }, value: 7 },
  {
    title: "Пробуждение",
    tracking: { type: "time", targetStart: "08:00", targetEnd: "09:30" },
    value: "08:45",
  },
].map(({ value, ...goal }, index) => ({
  ...goal,
  id: `00000000-0000-4000-8000-00000000000${index + 2}`,
  ownerId: accountId,
  month: "2026-10",
  description: null,
  cadence: { period: "day" },
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  entries: [{ date: today, value, met: index !== 0, note: null, createdAt: now, updatedAt: now }],
}));
const reminders = new Map();
const worker = createWorker(async (request) => {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/me")
    return Response.json({
      user: { id: accountId, displayName: "Локальная проверка", username: null, photoUrl: null },
    });
  if (path === "/api/reminders/settings") {
    if (request.method === "PUT") {
      Object.assign(settings, await request.json());
      return Response.json(settings);
    }
    return Response.json({
      settings,
      connection: "disconnected",
      botAvailable: false,
      deliveryIssues: 0,
    });
  }
  const month = /^\/api\/plans\/(\d{4}-\d{2})/u.exec(path)?.[1];
  if (month && request.method === "GET")
    return Response.json({
      month,
      today,
      goals: goals.filter(
        (goal) => goal.month === month && Boolean(goal.deletedAt) === path.endsWith("/trash"),
      ),
    });
  if (month && request.method === "POST") {
    const input = await request.json();
    const goal = {
      ...input,
      id: crypto.randomUUID(),
      ownerId: accountId,
      month,
      description: input.description ?? null,
      deletedAt: null,
      entries: [],
      createdAt: now,
      updatedAt: now,
    };
    goals.push(goal);
    return Response.json({ goal }, { status: 201 });
  }
  if (path.startsWith("/api/reminders/goals/")) {
    if (request.method === "PUT") {
      const goalId = path.split("/").at(-1);
      const rule = { ...(await request.json()), goalId, nextRunAt: null };
      reminders.set(goalId, rule);
      return Response.json(rule);
    }
    return Response.json({
      goals: goals
        .filter((goal) => !goal.deletedAt)
        .map((goal) => ({
          ...(reminders.get(goal.id) ?? {
            goalId: goal.id,
            mode: "off",
            time: "09:00",
            weekdays: [1, 2, 3, 4, 5, 6, 7],
            nextRunAt: null,
          }),
          title: goal.title,
        })),
    });
  }
  const parts = path.split("/");
  const goal = goals.find((goal) => goal.id === parts[3]);
  if (!goal) return Response.json({ code: "GOAL_NOT_FOUND" }, { status: 404 });
  if (parts[4] === "entries") {
    const date = parts[5];
    const previous = goal.entries.find((entry) => entry.date === date);
    if (request.method === "DELETE") {
      goal.entries = goal.entries.filter((entry) => entry.date !== date);
      return new Response(null, { status: 204 });
    }
    const input = await request.json();
    const value = input.value ?? input.completed;
    const entry = {
      date,
      value,
      met: goal.tracking.type === "quantity" ? value >= goal.tracking.targetValue : value !== false,
      note: input.note ?? previous?.note ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    goal.entries = [...goal.entries.filter((entry) => entry.date !== date), entry];
    return Response.json({ entry });
  }
  if (request.method === "PATCH") {
    Object.assign(goal, await request.json());
    return Response.json({ goal });
  }
  goal.deletedAt = parts[4] === "restore" ? null : now;
  return new Response(null, { status: 204 });
}, ui);
const env = {
  RITM_API_TOKEN: `ritm_${"a".repeat(43)}`,
  RITM_OWNER_EMAIL: "owner@example.test",
  RITM_ACCOUNT_ID: accountId,
};
const parent = `<!doctype html><html lang="ru"><title>Ритм — локальная проверка</title><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style><iframe id="ritm-frame" title="Ритм" src="/ui"></iframe><script>
const frame=document.getElementById('ritm-frame');
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin)return;
 const m=event.data;if(!m || m.jsonrpc!=='2.0')return;
 const send=result=>event.source.postMessage({jsonrpc:'2.0',id:m.id,result},location.origin);
 if(m.method==='ui/initialize'){send({protocolVersion:m.params.protocolVersion,hostInfo:{name:'Local smoke',version:'1.0.0'},hostCapabilities:{serverTools:{}},hostContext:{theme:'light',displayMode:'fullscreen',availableDisplayModes:['inline','fullscreen']}});}
 else if(m.method==='tools/call'){const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});const result=await response.json();event.source.postMessage(result,location.origin);}
 else if(m.id!==undefined)send({});
});</script></html>`;
const server = createServer(async (incoming, outgoing) => {
  if (incoming.headers.host !== "127.0.0.1:8791") {
    outgoing.writeHead(403).end();
    return;
  }
  try {
    if (incoming.url === "/ui") {
      outgoing.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(ui);
      return;
    }
    if (incoming.url !== "/rpc") {
      outgoing.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(parent);
      return;
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 65_536) {
        outgoing.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const response = await worker.fetch(
      new Request("https://test.invalid/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "oai-authenticated-user-email": env.RITM_OWNER_EMAIL,
        },
        body: Buffer.concat(chunks),
      }),
      env,
    );
    outgoing
      .writeHead(response.status, { "Content-Type": "application/json" })
      .end(await response.text());
  } catch {
    outgoing.writeHead(500).end("Local smoke failed");
  }
});
server.listen(8791, "127.0.0.1", () =>
  console.log("Ритм: локальная проверка http://127.0.0.1:8791"),
);
