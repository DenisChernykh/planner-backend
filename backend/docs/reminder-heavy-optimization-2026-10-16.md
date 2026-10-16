# Heavy Cron optimization — 16 October 2026

**Revision `644a395` is deployed. Its authorized production control still fails
the 10 ms CPU criterion: input capture used 10.733 ms and calculation/rendering
used 16.639 ms. Stable Free-tier operation has not been established.**
The deployed `d298b60` exceeded the budget in the
[previous production control](reminder-heavy-cpu-2026-10-16.md): 12.761 ms for
month copy, 16.740 ms for inheritance, 23.321 ms for quiet-hour report scheduling
and 33.082 ms for report preparation. Those were correlated Cloudflare invocation
metrics, not local estimates.

## Changes

Weekly Cron now has four independent steps: schedule, capture inputs, calculate
and render, then send. Capturing persists plain calculation inputs in the existing
pending job. The next tick calculates from those frozen facts; the displayed
formation time remains the input-capture time. Later facts are not mixed into
that snapshot. This adds one minute to an otherwise idle report pipeline.

The intermediate payload is version 2 and cannot be claimed for sending. It
carries negative placeholder revisions so the previous Worker rebuilds it if
rolled back. Completed version-1 snapshots keep their format and remain sendable.
Every tick reads current report/progress settings, connection and quiet hours;
selection or revision changes discard stale inputs. Snapshot writes compare the
previous payload, and the existing atomic delivery claim still checks current
eligibility. Parallel ticks cannot send an intermediate payload or send twice.

D1 returns fact histories as JSON arrays per selected goal, alongside only the
needed definitions, in two indexed statements. This avoids Drizzle construction
and hundreds of fact result-row conversions. Unselected fact histories and entry
notes are not loaded. Neighbouring chain/month definitions remain available for
missing-plan detection. Report calculation skips unused three-week history;
HTTP previews and the Progress page keep their existing detail. Dates, intervals,
entry lookups and definition signatures are reused within one calculation.

Month copy reads initialization, previous month and source definitions in one
owner-scoped query, and avoids loading unused inheritance data. Its atomic
receipt/goal commit and full source-revision checks are unchanged. Cron inheritance
reads only actionable source/target pairs, up to 24 per tick, and resumes larger
plans or unfinished generations on later ticks. Completed/manual settings are
not rewritten. Non-Cron preparation retains full chain recovery. Identical reminder
calendars and the start of day are computed once per inheritance pass.

Scheduling reuses the current connected-account snapshot. Report and progress
settings join the due job's delivery read. Shared formatting machinery has bounded
caches. Ordinary local times use verified native calendar resolution; transition
days and historical second-based offsets retain Luxon's gap/fold behavior.
No schema, infrastructure, Cron, plan tier or production setting changed.

## Local measurements

Node 24.18.0 and pnpm 11.15.1; sequential fresh workerd processes, without parallel
tests. Two owners have 24 mixed goals each, four tracking types, three cadences,
28 facts per goal, 19 report inclusions, five exclusions and three reminder
calendars. The report week crosses into November; rollover simulates 1 November.
The quiet-hour scheduling fixture uses 00:00–23:59 and never sends.

| Step | First use min–max, ms (3 runs) | Warm maximum, ms | D1 statements |
| --- | ---: | ---: | ---: |
| Schedule report | 5.158–6.291 | 2.616 | 6 |
| Schedule during quiet hours | 4.304–5.341 | 2.172 | 6 |
| Capture report inputs | **5.252–29.120** | 2.981 | 6 |
| Calculate/render captured inputs | 6.264–9.105 | 5.044 | 4 |
| Send prepared report | 4.175–5.823 | 2.899 | 5 |
| Copy month | 4.320–5.428 | 4.746 | 6 |
| Inherit settings | 5.216–6.811 | 3.953 | 6 |

**All 330 warm observations were below 10 ms; 20 of 21 first-use estimates were
below it. This is not proof that production fits.** There are 30 warm observations
per report step, 60 copy observations and 120 inheritance observations. Both
owners must complete their copied goals, rules and report selections. Fake sends
must finish once; no external network is allowed.

The 29.120 ms input-capture outlier is retained. Its profile assigns one
18.063 ms sample to `cloudflare-internal:d1-api._send`, plus a 4.857 ms anonymous
sample. This sampling method cannot distinguish CPU consumption from host
scheduling or native-call waiting for that long interval. It is not adjusted or
replaced by another run. Earlier combined-preparation candidates also exceeded
10 ms (including 10.613 ms), which motivated separating capture and calculation.
Those observations are preserved as intermediate results.

Measurements sum active V8 sample deltas, not Cloudflare CPU accounting. Local
limits are not enforced. Network/D1 waiting is excluded from the production
[Free Cron CPU limit](https://developers.cloudflare.com/workers/platform/limits/#cpu-time),
which remains 10 ms; occasional successful overruns do not meet the criterion.
Personal workloads of 24 goals were measured. Larger report histories, arbitrary
plan sizes, other cold timezones and actual production boundaries remain outside
this local acceptance claim. Monthly goal copy remains atomic.

Raw observations, source fingerprints and outlier metadata are in
[`reminder-cpu-2026-10-16-heavy-optimized-local.json`](reminder-cpu-2026-10-16-heavy-optimized-local.json).

### Reproduce

Run sequentially on this revision. Each next process receives persisted output
from the previous process, without warming the measured Worker:

```sh
PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24 PLANNER_PROFILE_FIRST_SCENARIO=weekly-report-prepare PLANNER_PROFILE_FIRST_ONLY=1 PLANNER_PROFILE_SNAPSHOT_OUTPUT=/private/tmp/planner-input.json pnpm reminders:profile
PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24 PLANNER_PROFILE_FIRST_SCENARIO=weekly-report-render PLANNER_PROFILE_FIRST_ONLY=1 PLANNER_PROFILE_SNAPSHOT=/private/tmp/planner-input.json PLANNER_PROFILE_SNAPSHOT_OUTPUT=/private/tmp/planner-ready.json pnpm reminders:profile
PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24 PLANNER_PROFILE_FIRST_SCENARIO=weekly-report-send PLANNER_PROFILE_FIRST_ONLY=1 PLANNER_PROFILE_SNAPSHOT=/private/tmp/planner-ready.json pnpm reminders:profile
PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24 PLANNER_PROFILE_FIRST_SCENARIO=idle PLANNER_PROFILE_SCENARIOS=weekly-report,weekly-report-quiet,rollover,rollover-inherit PLANNER_PROFILE_ITERATIONS=30 pnpm reminders:profile
```

The profiler verifies input persistence, completed snapshots and send attempts.
Its inherited fixture now preserves weekly/monthly target counts. Follow-up
bounds account for 24-rule batches, including larger optional local fixtures.

## Checks and production gate

The implementation has regression coverage for frozen facts, revision/selection/
timezone/quiet-hour invalidation, concurrent rendering and sending, bounded
inheritance resumption, owner scope, indexed history reads, month/year boundaries,
quarter-hour offsets, half-hour DST gaps/folds and a missing local midnight.
Root `pnpm boundaries:check` and `pnpm check` passed: 136 frontend tests,
276 backend tests, 16 adapter tests, type/format/architecture checks, Worker
dry-run and the monolith smoke. This is local verification, not a GitHub CI
or production result. The implementation subsequently passed
[GitHub CI](https://github.com/DenisChernykh/planner-backend/actions/runs/38930738693).

The owner separately authorized publishing `644a395` and this control with
“Опубликовать и проверить оба сценария с одним отчётом”. The previous one-report
authorization was not reused. The executed control plan was:

1. Commit and push the checked revision, then publish that exact revision to the
   existing Worker `app`. Keep D1, secret bindings, invocation-log policy and the
   one Cron unchanged; no migration or paid resources.
2. Seed one isolated owner with 24 previous-month goals, reminder calendars and
   report selections. Keep its general reminders disabled, report slots in the
   future and all-day quiet hours active. Let ordinary Cron copy and inherit.
3. Make only the synthetic weekly slot due; observe its deferred pending job and
   cancel it unsent. Enqueue exactly one real control report with a fresh control
   event key in the connected account. Preserve normal goals, selections, settings
   and Wednesday/Sunday slots. Observe capture, rendering and one send separately.
4. Read Cloudflare CPU for every stage and corroborate version/time with D1
   transitions. Do not call an over-10-ms success a pass, or equate missing metrics
   with a pass. Do not retry an ambiguous send.
5. Cancel unsent control work at a bounded deadline, remove the isolated owner
   and cascading fixture data, and retain real delivery history. Confirm unchanged
   ordinary configuration, no active control work and no foreign-key violations.

## Authorized production result

The checked and pushed source `644a3955ca247e9cc3c84cac81e94a5acd5f9054` was
published to the existing Worker `app` at 16:24:29 UTC as version
`0e65aa5e-0f32-416e-a2d2-adfd8f740eb3`, serving 100% of traffic. `/health`
confirmed that exact source. Deployment preserved D1, all binding names/types,
observability settings (including disabled invocation logs) and the existing
`* * * * *` Cron. No migration, plan change or new resource was used.

Ordinary Cron executed the control at 16:25–16:30 UTC (21:25–21:30
Asia/Yekaterinburg). Each row is a separate invocation correlated with D1 state:

| Stage | UTC minute | Cloudflare CPU, ms | Result |
| --- | --- | ---: | --- |
| Copy 24 previous-month goals | 16:25 | 9.228 | 24 current-month goals |
| Inherit reminders/report selections | 16:26 | 9.257 | 24 rules, 24 selections, five exclusions |
| Schedule during quiet hours | 16:27 | 5.021 | deferred to 23:59 local, cancelled unsent |
| Capture report inputs | 16:28 | **10.733** | version-2 inputs persisted, zero send attempts |
| Calculate/render inputs | 16:29 | **16.639** | version-1 snapshot persisted, zero send attempts |
| Send prepared report | 16:30 | 9.075 | sent, one attempt, message ID present |

All six invocations completed successfully, but the two overruns fail the CPU
criterion. Copy, inheritance and send have less than 1 ms observed headroom;
one successful run does not establish stability. Compared with the previous
control, copy fell from 12.761 to 9.228 ms, inheritance from 16.740 to 9.257 ms,
and quiet-hour scheduling from 23.321 to 5.021 ms. The previous 33.082 ms snapshot
preparation is now two separate steps; their sum is not a per-invocation budget.

The real snapshot selected 17 goals and 46 persisted entries. Input payload
length was 8,479 characters, then 12,715 for the ready snapshot. The input-capture
formation timestamp remained unchanged through rendering and sending. There was
exactly one real send attempt and no synthetic send. The persisted `sent` state
and message ID confirm Telegram API acceptance; client receipt was not separately
observed. The control used a separate event key, preserving ordinary report slots.

These are Cloudflare `workersInvocationsAdaptive` values, grouped by minute,
script version, status and colo. Every attributed group has one request, zero
errors, average sample interval 1 and equal P50/P99. D1 transitions corroborate
attribution. HTTP health groups in EWR and an older-version invocation are
excluded. This dataset has no Cron request-source filter, so attribution is
correlated evidence, not an event-level Cron trace or evidence of isolate identity.
At 16:31:19 UTC the separately queried scheduled-event dataset was still empty;
that response is retained and is not treated as a pass or zero executions.

Cleanup completed at 16:31:01 UTC: zero fixture goals, links or jobs, zero active
control jobs and zero foreign-key violations. The isolated owner and cascading
source/target goals, settings, rules, selections and rollover markers were
removed. Real general/report settings and selections matched their pre-control
fingerprint, including ordinary Wednesday/Sunday slots. Real sent history remains.

Production exercised copying into an unprepared current month, not a real clock
transition at midnight. A report week crossing a month boundary and larger fact
histories remain local-only evidence. This control does not resolve the retained
29.120 ms local first-capture outlier or prove a reliability distribution. Further
optimization must reduce capture and calculation CPU and increase the small
headroom of month processing and sending; increasing the paid limit is not an
accepted fix.

Sanitized metrics, deployment metadata and transition/cleanup readbacks are in
[`reminder-cpu-2026-10-16-644a395-production.json`](reminder-cpu-2026-10-16-644a395-production.json).
The implementation checks and CI above apply to the deployed source. The evidence
update also passed root `pnpm check` before commit; it changes documentation only.


## Further bounded-stage implementation

The next [bounded-stage implementation](reminder-heavy-stages-2026-10-16.md)
separates selection, input capture, four-group calculation batches, formatting and
sending; it also copies months atomically in D1 and inherits eight edges per tick.
It is not deployed. Its local observations, including retained inheritance
estimates above 10 ms, are separate from the `644a395` production control above.
