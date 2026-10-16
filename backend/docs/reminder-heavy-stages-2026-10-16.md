# Bounded weekly report stages — 16 October 2026

This follow-up is not deployed. The currently published `644a395` still exceeded
10 ms for input capture (10.733 ms) and calculation/rendering (16.639 ms), as
recorded in the [production control](reminder-heavy-optimization-2026-10-16.md).
The changes below require a separately authorized production control before any
claim of stable Free-tier CPU usage. Local sampling does not enforce that limit.

## Changes and behavior

The once-per-minute Cron persists a single transition per invocation:

1. Schedule the existing weekly job.
2. Read report selections and save preparation metadata (payload version 5).
3. Capture progress facts and their formation time (version 2).
4. Calculate at most four compatible definition groups from those frozen facts.
   Persist the cursor and completed goal results (version 3) until all groups are
   complete, then aggregate the overview (version 4).
5. Format the ready message (version 1).
6. Atomically claim and send that ready message on the next tick.

Monthly versions with compatible rules stay in the same calculation group;
changed rules remain separate. Every intermediate tick rechecks connection,
expiry, quiet hours, report/progress revisions and active selections. Persisted
steps compare the previous payload; concurrent ticks cannot append the same
batch twice. Facts edited after capture are not mixed into later batches.
A restarted isolate resumes solely from D1, with no cached job or facts.
Intermediate negative revisions make the older Worker rebuild them on rollback.
The claim explicitly accepts only version 1, rechecks the complete selection in
SQLite and preserves ambiguous-send handling. A stale ready selection resets
unsent preparation for the next tick instead of performing an extra selection
read during every successful send.

The intermediate results contain only fields needed by the report. Facts belonging
only to completed chains are released from the saved calculation input; chains
with pending changed-rule groups retain all their captured facts. Interactive
Progress and HTTP previews keep their complete detail. HTML length accounting
is linear in the number of included goal blocks; formatting no longer re-renders
the whole accumulated prefix for every candidate. The Cron ready snapshot omits
preview blocks, retaining identical text, HTML and buttons.

Progress source definitions, ancestry and selected facts now come from one
owner-scoped SQLite statement. This removes a separate ancestry result/statement
and gives the read one database snapshot. Initial selection loading runs before
capture and its work is persisted independently.

Month copying for callers that do not request carried-goal results uses one D1
batch: insert the rollover receipt and copy canonical stored definitions with
`INSERT SELECT`. Source selection, source edits, destination checks and all copies
serialize in that transaction. No source definitions, revision arrays or new
goal DTOs are decoded and re-serialized in Worker JavaScript. The domain supplies
the target month's maximum monthly occurrences; copying clamps only monthly
cadence, creates fresh UUIDs and timestamps and preserves visible source order.
Manual destinations (including trash) are sealed without copying; an empty
previous receipt remains an empty source. A failed copy rolls back its receipt.
The existing optimistic domain-copy path remains for callers requesting carried
results. [D1 batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
confirms sequential transactional execution and rollback on statement failure.
Cron inheritance is reduced from 24 to eight pending edges per tick; existing
HTTP recovery and guards against overwriting edited settings remain unchanged.

Preparation continues to use the existing oldest-due queue: simultaneous reminder
work can wait while a report is being prepared. Preparation continues to use the existing oldest-due queue: simultaneous reminder
work can wait while a report is being prepared. These choices add latency: without backlog, maintenance, quiet hours or retries,
a report with G compatible groups sends about `ceil(G / 4) + 4` minutes after its
scheduling tick (10 minutes for 24 groups). Twenty-four inherited rules now take
three inheritance ticks after month copy. Existing expiry and single Cron remain;
no migration, new resource, plan change or automatic deployment was added.

## Verification

Regression coverage includes frozen facts and fresh-runner resumption; concurrent
batch calculation and sending; invalidation at intermediate/ready phases; stale
ready selections; compact/full report parity across month and rule changes;
February target clamping; concurrent native month copies; manual/trash/empty
sources; source owner isolation; and rollback/recovery after copy failure.

Node 24.18.0, pnpm 11.15.1; two owners with 24 mixed goals each, 28 facts per
goal, 19 inclusions/five exclusions and three reminder calendars. Local report
week crosses November; month copying simulates 1 November. Setup is outside the
profile. Every next fresh process receives the persisted previous stage; all
five calculation batches for the 19 included goals are measured separately.
No external network is allowed. Each full report must end in one fake send;
both owners must complete all copied goals, rules and report selections.

| Stage | Fresh min–max, ms | Warm maximum, ms | Warm observations | D1 statements |
| --- | ---: | ---: | ---: | ---: |
| schedule-report | 3.487–4.692 | 3.194 | 60 | 6 |
| schedule-during-quiet-hours | 4.027–4.995 | 2.285 | 60 | 6 |
| select-goals | 4.266–5.191 | 2.703 | 60 | 5 |
| capture-inputs | 4.920–8.160 | 3.769 | 60 | 5 |
| calculate-batch | 4.970–8.344 | 3.937 | 300 | 4 |
| format-report | 5.259–6.613 | 2.480 | 60 | 4 |
| send-report | 3.622–4.955 | 3.069 | 60 | 4 |
| month-copy | 4.575–5.387 | 2.851 | 120 | 5 |
| inherit-settings | 5.917–6.858 | 17.712 | 720 | 6 |

All 39 final fresh-process estimates were below 10 ms. The two complete warm
series retained **two estimates above 10 ms out of 1,500**: inheritance at
17.712 ms and 16.906 ms, both at iteration 19, followup step 2 of the standalone
inheritance scenario. They are not discarded or replaced by the better series.
The second profile attributes one 14.987 ms sample to `inheritanceState`, plus
0.998 ms to native D1 `bind`. This sampling result does not establish whether
that long interval was active CPU, runtime compilation, native waiting or host
descheduling. The repeated ordinal prevents treating it as proven random noise.
The first profile was overwritten by another same-phase step; the profiler now
includes the step number in profile filenames and the second profile is retained.

The method sums active V8 sample deltas, not Cloudflare CPU. Local limits are not
enforced; zero estimates mean no active samples, not zero CPU. Warm maxima for
report stages and month copy are below 4 ms. Stable production usage below
10 ms remains unproven. Larger workloads and histories are outside this measured
capacity claim. Earlier candidates and every final estimate are preserved in
[`reminder-cpu-2026-10-16-bounded-stages-local.json`](reminder-cpu-2026-10-16-bounded-stages-local.json),
with runtime-source fingerprints and outlier metadata.

The profiler adds selection and calculation scenarios, verifies each payload
version and bounds the entire multi-step pipeline; missing completion fails the
run. For a fresh pipeline, run `PLANNER_PROFILE_FIRST_ONLY=1`, with
`PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24` and successive
`PLANNER_PROFILE_FIRST_SCENARIO` values `weekly-report-select`,
`weekly-report-prepare`, repeated `weekly-report-calculate` until version 4,
`weekly-report-render`, then `weekly-report-send`. Pass the prior process output
with `PLANNER_PROFILE_SNAPSHOT` and save each next state with
`PLANNER_PROFILE_SNAPSHOT_OUTPUT`; never prepare inputs in the measured process.
For full warm pipelines use `PLANNER_PROFILE_SCENARIOS=weekly-report,weekly-report-quiet,rollover,rollover-inherit PLANNER_PROFILE_ITERATIONS=30 pnpm reminders:profile`.

Root `pnpm check` and `pnpm boundaries:check` passed: 136 frontend tests,
287 backend tests, 16 adapter tests, type/format/architecture checks, Worker
dry-run and the monolith smoke. This is local verification, not GitHub CI or
a production result. This revision has not been deployed and has not sent a real
Telegram message.

## Production control gate

Before publishing, commit and push the checked source. Root `AGENTS.md` requires
explicit authorization for deployment and Telegram mutation. The earlier
permission applied to `644a395` and one report, and has been consumed.

The next concrete control uses only Worker `app`, its current D1 and its one
Cron: seed an isolated owner with 24 previous-month mixed goals and selections,
keep general reminders disabled and synthetic quiet hours at 00:00–23:59, and
observe one copy plus all three eight-edge inheritance ticks. Make only the
synthetic weekly slot due, confirm deferral and cancel it unsent. Enqueue exactly
one fresh control report for the existing connected real account, preserving all
ordinary goals, selections, settings and Wednesday/Sunday slots. Observe every
selection/capture/calculation/format/send tick separately. Cancel unsent control
work at a bounded deadline, remove the isolated owner and cascading fixture rows,
and retain real send history. Confirm unchanged normal configuration, zero active
control work and no foreign-key violations. Read Cloudflare CPU for each stage;
label delayed/missing or only correlated metrics honestly. Any invocation above
10 ms fails acceptance even when its status is `success`; do not retry an
ambiguous send or replace an inconvenient measurement with another invocation.
