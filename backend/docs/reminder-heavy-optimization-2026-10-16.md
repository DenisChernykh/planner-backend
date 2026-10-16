# Heavy Cron optimization — 16 October 2026

**The implementation is checked locally, but has not been deployed. Stable
production CPU below 10 ms still requires an authorized Cloudflare control.**
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
or production result.

Deployment and a new Telegram control require separate permission under root
`AGENTS.md`; the previous one-report authorization was already consumed. The
concrete next control is:

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

This plan is awaiting permission; this optimization task has not changed remote
D1, deployed code or sent any additional Telegram messages.
