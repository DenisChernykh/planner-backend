# Completed production CPU control — 17 October 2026

The newly authorized control completed, including exactly one test weekly report.
**The strict 10-ms CPU criterion failed.** Copying, capture and delivery can complete
successfully while individual inheritance/calculation invocations exceed the
Free-tier budget. This run does not establish reliable CPU below 10 ms.

The previous interrupted control remains documented separately in
[`reminder-cpu-control-2026-10-17.md`](reminder-cpu-control-2026-10-17.md).
After that interruption, the owner explicitly authorized a fresh attempt. It used
a new fixed `planner-47021ef-control-2026-10-17-retry1` manifest, created with `wx`
and permissions 0600. Old manifests and permissions were not reused. The local
observer/operator path agreement and three network-free manifest-path mock cases
passed before remote fixture creation.

## Scope and direct state evidence

Production remained on source `47021ef0f0fc63b028be5e3d6d4619b71e872402`, Cloudflare
version `873fe2c9-bbd5-4e4a-9c98-12044f16f6d6`. Git started clean on `main`, tracking
`origin/main` at documentation commit `ed78c6c`. No deployment, migration, schema,
resource, plan, normal setting or normal schedule change was performed.
Read-only preflight verified the existing D1, one minute Cron, invocation logs off,
zero backlog/FK violations and sufficient time outside actual quiet hours.
The experiment deadline was 05:58:07 UTC, before the next ordinary reminder at
06:00 UTC. A private manifest prevented duplicate fixture/report creation.

The fixture had 24 September goals, four tracking types, three cadences and three
reminder calendars, plus 19 included and five excluded report selections. Its
ordinary reminders were disabled; its report quiet hours were 00:00–23:59. These
were synthetic September-to-October recovery conditions during the day, rather
than an actual wall-clock transition at midnight.

| UTC | Observed state |
| --- | --- |
| 04:29:29 | 24 source goals, zero target goals. |
| 04:30:19.658 | Native month copy: all 24 target goals created in the same operation. |
| 04:31–04:54 | Exactly one inheritance edge per Cron tick, every count 1 through 24 directly observed; 24 rules, 24 report selections and all five exclusions at completion. |
| 04:55:21 | Synthetic weekly job pending until 18:59 UTC / 23:59 local, no snapshot, zero attempts, no message ID. |
| 04:55:30 | Synthetic unsent job cancelled; exactly one real control job created without replacing an ordinary job. |
| 04:56 | Selection persisted as version 5 with 17 selected goals. |
| 04:57 | Native capture persisted as version 6, offset 0, 17 sources and 46 entries. |
| 04:58–05:14 | Version 7 advanced one group at a time through offsets 1–16; the 05:00 hourly maintenance tick left offset 2 unchanged. |
| 05:15 | Last calculation persisted version 8 with all 17 goals. |
| 05:16 | Separate summary persisted version 4. |
| 05:17 | Formatting persisted ready version 1. |
| 05:18 | One send accepted by Telegram transport; D1 status `sent`, attempts 1 and message ID present. |

The captured formation time was `2026-10-17T04:57:19.718000+00:00` and stayed unchanged through
calculation, summary, formatting and sending. Selection has its earlier timestamp;
the raw capture establishes the frozen report input. The report was observed sent
at `2026-10-17T05:18:21.666Z` (about 22.9 minutes after enqueue).
This confirms one accepted transport attempt and retained D1 sent history; it does
not prove that a person read the Telegram message.

## Observer access interruption

At 05:11:20 UTC the local status read returned HTTP 403 after the existing
Wrangler OAuth session expired. Protective cleanup also failed at its first D1
operation. The standard read-only `wrangler whoami` refreshed the existing
authorization. Readback confirmed the same fixture and same pending report,
zero attempts, unchanged fingerprint and offset 13 before the next Cron mutation.
Observation resumed against the original manifest and deadline in an explicit
resume-only mode that forbids fixture/job creation. A second read at 05:12:35
confirmed offset 14. No new control or replacement report was created. The
05:12:19 recovery snapshot of offset 13 is correlated with the 05:11 Cron event,
rather than incorrectly assigning it to the next tick. Final cleanup succeeded.

## Cloudflare CPU measurements

Queries used `workersInvocationsAdaptive` with limit 100 and bounded time windows,
then correlated event timestamp, minute, deployed version and D1 transitions.
Live GraphQL schema documents `cpuTimeP50`/`cpuTimeP99` in microseconds; table values
are divided by 1,000. Every stage-correlated group has one request, zero errors,
sample interval 1 and equal P50/P99. All returned groups use the expected version.

There is no Cron/HTTP request-source discriminator in the exposed adaptive
schema. The once-per-minute `:19` event sequence agrees with D1 stage mutations;
these are strong stage candidates, not function-level traces. Known health
calls and other concurrent traffic are retained separately in the evidence.
Multi-request groups have different P50/P99 and are not treated as one Cron tick.
The dedicated `workersInvocationsScheduled` dataset was also queried; see below.

| Stage | Correlated groups | Maximum CPU, ms | Above 10 ms |
| --- | ---: | ---: | ---: |
| 24-goal month copy | 1 | 4.473 | 0 |
| One-edge inheritance | 24 | 15.466 | 5 |
| Synthetic quiet scheduling | 1 | 9.587 | 0 |
| Report selection | 1 | 5.005 | 0 |
| Native raw capture | 1 | 4.844 | 0 |
| One calculation group | 17 | 17.165 | 9 |
| Hourly maintenance | 1 | 2.279 | 0 |
| Separate summary | 1 | 5.461 | 0 |
| Formatting | 1 | 6.494 | 0 |
| Real report send | 1 | 7.746 | 0 |

All stage-correlated overruns are retained:

| UTC event | Stage | Colo | CPU, ms |
| --- | --- | --- | ---: |
| 04:32:19 | inheritance 2/24 | ORD | **15.466** |
| 04:36:19 | inheritance 6/24 | ORD | **11.531** |
| 04:40:19 | inheritance 10/24 | IAD | **13.899** |
| 04:41:19 | inheritance 11/24 | ATL | **10.993** |
| 04:42:19 | inheritance 12/24 | IAD | **10.926** |
| 04:58:19 | report calculation 1/17 | MIA | **12.035** |
| 05:07:19 | report calculation 9/17 | ORD | **11.262** |
| 05:08:19 | report calculation 10/17 | ORD | **12.075** |
| 05:09:19 | report calculation 11/17 | MIA | **10.104** |
| 05:10:19 | report calculation 12/17 | ATL | **10.146** |
| 05:11:19 | report calculation 13/17 | IAD | **10.179** |
| 05:13:19 | report calculation 15/17 | ORD | **12.094** |
| 05:14:19 | report calculation 16/17 | ORD | **17.165** |
| 05:15:19 | report final calculation 17/17 | ORD | **10.060** |

Other observed overruns, without assigning them to the control stages:

| UTC event | Candidate / attribution | Colo | Requests | P50 / P99, ms |
| --- | --- | --- | ---: | ---: |
| 04:54:23 | health HTTP candidate | EWR | 1 | 10.638 / **10.638** |
| 04:55:23 | health HTTP candidate | EWR | 1 | 19.195 / **19.195** |
| 05:00:54 | unattributed concurrent traffic | WAW | 5 | 6.524 / **21.354** |
| 05:01:07 | unattributed concurrent traffic | WAW | 1 | 19.640 / **19.640** |
| 05:01:08 | unattributed concurrent traffic | WAW | 1 | 10.762 / **10.762** |
| 05:01:21 | unattributed concurrent traffic | WAW | 2 | 10.709 / **23.986** |

The scheduled dataset returned zero rows. This does not mean CPU was zero or
below the limit. Successful invocation status also does not erase observed
overruns. These are single-run observations, not a latency distribution or a
reliability guarantee. No function-level CPU cause can be established here.
The local inspector estimates and the real Cloudflare measurements must remain
separate. Inheritance and report calculation require further optimization;
synthetic quiet scheduling also has little measured headroom.

The query follows the
[official Workers GraphQL example](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/).
The [CPU limit documentation](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)
explains why occasional successful overruns do not establish Free-tier reliability.
Full sanitized D1 states, every query response, sampling and stage annotations are in
[`reminder-cpu-2026-10-17-47021ef-completed-control.json`](reminder-cpu-2026-10-17-47021ef-completed-control.json).

## Cleanup and verification

Protective cleanup completed after the confirmed send. A separate read-only D1
check found zero fixture owners, goals, rules, report selections, month receipts,
Telegram links or jobs; zero active control jobs and zero FK violations. The one
real control job and its one sent attempt remain in history. Every configuration
fingerprint matched. Pre/post settings, bindings, observability, one Cron,
deployments and ordinary schedule-state snapshots matched exactly; `/health`
remained on the expected source revision. No normal schedule was advanced by
this test. No replacement report or extra transport attempt was made.

The original `planner-cpu-17` automation remains paused. Local `pnpm check` passed
on Node 24.18.0 / pnpm 11.15.1, including formatting, frontend/backend checks,
adapter tests and monolith smoke. This documentation task changes no runtime
source and is not deployed.
