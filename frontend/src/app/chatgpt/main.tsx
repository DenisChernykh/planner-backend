import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { configureApiAdapter, createChatGptAdapter } from "@/shared/api";
import { ExternalNavigationContext, RuntimeContext } from "@/shared/lib/runtime";
import { AppProvider } from "../config/app-provider";
import { queryClient } from "../config/query-client";
import { routes } from "../router/routes";
import "../styles/index.css";

const app = new App({ name: "Ритм", version: "1.0.0" }, {}, { autoResize: true });
const container = document.getElementById("root");
if (!container) throw new Error("UI container is missing");
const root = createRoot(container);
let initialMonth: string | undefined;
let router: ReturnType<typeof createMemoryRouter> | undefined;

function applyContext(context: Partial<McpUiHostContext>) {
  if (context.theme) document.documentElement.classList.toggle("dark", context.theme === "dark");
}

async function openExternalLink(url: string) {
  const result = await app.openLink({ url });
  if (result.isError) throw new Error("ChatGPT could not open the external link");
}

app.onhostcontextchanged = applyContext;
app.ontoolresult = (result) => {
  const plan = result.structuredContent;
  if (
    plan &&
    typeof plan === "object" &&
    "month" in plan &&
    "goals" in plan &&
    "today" in plan &&
    typeof plan.month === "string" &&
    Array.isArray(plan.goals) &&
    typeof plan.today === "string"
  ) {
    const firstPlan = initialMonth === undefined;
    initialMonth = plan.month;
    queryClient.setQueryData([`/api/plans/${plan.month}`], plan);
    // The host can deliver the opening result after connect() has resolved.
    if (firstPlan && router) void router.navigate(`/plans/${plan.month}`, { replace: true });
  }
  void queryClient.invalidateQueries();
};

async function start() {
  await app.connect();
  applyContext(app.getHostContext() ?? {});
  configureApiAdapter(createChatGptAdapter((params) => app.callServerTool(params)));
  router = createMemoryRouter(routes, {
    initialEntries: [initialMonth ? `/plans/${initialMonth}` : "/"],
  });
  root.render(
    <RuntimeContext value="chatgpt">
      <ExternalNavigationContext value={openExternalLink}>
        <AppProvider>
          <RouterProvider router={router} />
        </AppProvider>
      </ExternalNavigationContext>
    </RuntimeContext>,
  );
  // A sidebar can stay mounted while chat tools write. Refresh visible data
  // without moving focus or fetching over the browser network.
  const refresh = () => {
    if (document.visibilityState === "hidden" || queryClient.isMutating() > 0) return;
    if (document.activeElement?.matches("input, textarea, [contenteditable='true']")) return;
    void queryClient.invalidateQueries();
  };
  const timer = window.setInterval(refresh, 30_000);
  window.addEventListener("focus", refresh);
  app.onteardown = async () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", refresh);
    root.unmount();
    return {};
  };
}

void start().catch(() => {
  root.render(
    <main className="mx-auto max-w-xl space-y-3 p-6">
      <h1 className="text-xl font-bold">Ритм</h1>
      <p role="alert">
        Не удалось подключиться к ChatGPT. Закройте панель и откройте плагин снова.
      </p>
    </main>,
  );
});
