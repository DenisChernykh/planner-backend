# Interrupted production CPU control — 17 October 2026

The authorized control of deployed `47021ef` did **not** complete. A local
observer used the wrong manifest path, failed before its first state read and
ran its protective cleanup. No weekly report was enqueued or sent. All fixture
data was removed and ordinary settings/schedules remained unchanged. The
optimization's stable production CPU below 10 ms remains unproven.

## Verified scope and sequence

The working tree was clean on `main`, tracking `origin/main` at documentation
commit `24a39ed`. Production `/health` returned the expected source
`47021ef0f0fc63b028be5e3d6d4619b71e872402`, version
`873fe2c9-bbd5-4e4a-9c98-12044f16f6d6`. Read-only preflight confirmed the existing
D1, one once-per-minute Cron, disabled invocation logs, zero backlog and no FK
violations. Stored authorization was available through the standard Wrangler
read-only account check. No deployment, migration, plan or platform resource
change was performed.

The private manifest was created with `wx` and permissions 0600. Before seeding,
the operator checked for existing control event keys/source markers, an active
report owner, no backlog, unchanged ordinary configuration and a 90-minute
window outside real quiet hours. Only the isolated fixture owner was written.
Its ordinary reminders were disabled and its reports used synthetic quiet hours
00:00–23:59.

| UTC time | Directly observed result |
| --- | --- |
| 04:12:45.377 | Private manifest created for this single control. |
| 04:12:54.801 | Isolated fixture activated after source data setup. |
| 04:12:56.887 | D1 readback: 24 September source goals, zero October goals/rules/selections. |
| 04:13:40–43 | Observer failed; cleanup cancelled any matching pending control job and deleted its fixture owner. |
| 04:13:43.091 | Cleanup readback: zero fixture goals/links/jobs, zero active control jobs/FK violations, ordinary configuration fingerprint unchanged. |
| 04:16:47.125 | Additional read-only check: zero fixture owners/goals/rules/selections/receipts/links/jobs, zero real control jobs and attempts. |

The operator's manifest filename ended in `-control-state.json`, whereas the
new observer expected `-state.json`. Its initial read threw ENOENT; the `finally`
handler correctly removed the owned fixture, but this also prevented the
remaining 24-edge inheritance, synthetic scheduling and report stages from being
observed. The cleanup operator read the correct manifest, so ownership checks
still applied. Neither synthetic scheduling nor the real report had been armed.

An earlier progress message prematurely described the copy as completed. That
claim was corrected in the chat: no post-copy target count or receipt was read
before deletion. The source fixture's creation and cleanup are confirmed;
completion of its copy is not directly confirmed.

## Available Cloudflare metrics

The GraphQL query used the existing `workersInvocationsAdaptive` dataset with
limit 100, the deployed version and the 04:12–04:16 UTC window. Two reads returned
the same three groups. Live schema descriptions confirm that `cpuTimeP50` and
`cpuTimeP99` are microseconds; values below are divided by 1,000. Every group has
one request, zero errors, average sample interval 1 and equal P50/P99.

| UTC minute | Colo | CPU P50/P99, ms | Attribution limit |
| --- | --- | ---: | --- |
| 04:12 | ATL | 4.033 | Before fixture activation; likely ordinary Cron work. |
| 04:12 | EWR | **19.118** | Health-call candidate during operator verification; retained, not hidden as a passing sample. |
| 04:13 | ATL | 6.461 | Possible copy invocation after activation; no saved D1 post-copy count, so not a validated 24-goal stage measurement. |

These are minute/version/status/colo groups, not request-source-filtered event
traces. Health and Cron attribution is inferential. The `workersInvocationsScheduled`
dataset was empty in both reads. Successful invocation status and an empty
scheduled dataset do not establish Free-tier reliability. No CPU result is
available for inheritance, synthetic quiet scheduling, report capture,
calculation, summary, formatting or sending in this control.

The query follows the
[official Workers GraphQL example](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/).
The [CPU limit documentation](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)
explains that occasional successful overruns can occur; success alone is not
acceptance evidence. Full sanitized observations and live unit descriptions are
in [`reminder-cpu-2026-10-17-47021ef-interrupted-control.json`](reminder-cpu-2026-10-17-47021ef-interrupted-control.json).

## Cleanup, correction and next gate

Read-only postflight matched the preflight D1 binding, observability, Cron and
ordinary schedule state exactly. `/health` still serves `47021ef`. The local
observer/metrics paths were corrected to match the operator and a startup path
agreement check was added before observation/cleanup. `node --check` and local
read-only path consistency assertions passed. Three network-free mock cases
confirmed the matching path and that mismatched/missing manifests abort before
operator or cleanup calls. The corrected observer was not run against production. No replacement fixture or report was created.

Automation `planner-cpu-17` is paused. The control's idempotency instruction
forbids creating a second fixture or replacement report after a started run;
therefore a new experiment requires explicit authorization. A proposed fresh
attempt must use a new fixed manifest/control prefix, validate all helper paths
before any remote mutation, observe the initial copy and all inheritance ticks,
then run synthetic quiet scheduling and at most one first real report. Existing
control history/manifest must remain intact. No further deployment is required.

## Subsequent authorized control

The owner subsequently authorized a fresh control with a new fixed manifest and
event prefix. It completed without reusing this interrupted fixture or permission.
Exactly one real report was sent, cleanup passed, and production CPU still
exceeded 10 ms in inheritance/calculation. See the
[completed follow-up](reminder-cpu-control-completed-2026-10-17.md); this document
retains the original interrupted attempt's evidence unchanged.
