# Native capture and projected report stages — 16 October 2026

This follows the failed production control of
[`d3fdc6c`](reminder-heavy-stages-2026-10-16.md#authorized-production-control--d3fdc6c).
That revision was deployed and completed its control, but four attributed
invocations exceeded 10 ms CPU: inheritance 11.130, capture 14.591,
calculation 15.183 and final calculation/summary 11.236 ms. Sending took
6.990 ms. The isolated fixture was removed; the one authorized real report
was sent once. Full evidence and attribution limits remain in the linked report.

The implementation was deployed as `47021ef` after explicit authorization and
successful CI. The new production control is scheduled for 17 October, 09:10
Asia/Yekaterinburg; it has not run yet. Local inspector samples are estimates,
not Cloudflare CPU metrics or proof of stable Free-tier operation.

## Persisted steps

The existing single, once-per-minute Cron performs one transition per invocation:

1. Schedule a weekly job with an empty payload.
2. Read selections and current-period active IDs together; persist version 5.
3. Capture raw definitions, owner-scoped ancestry and entry values with one native
   D1 UPDATE/CTE. Save formation time and a fresh capture ID, version 6.
4. Calculate one compatible definition group per tick, version 7. D1 projects
   facts for the current chain only; all definitions stay available for grouping,
   comparisons and missing-plan checks. Append only that group's result in D1.
   Completed results and other frozen facts do not cross the Worker boundary.
5. The last group persists version 8 and removes source facts. On a separate tick,
   D1 returns aggregate counts and unique eligible/recorded dates. The application
   calculates the overview header; D1 attaches the already stored goal results,
   version 4. The final group does not also aggregate the whole report.
6. Format version 1. The version-4 read projection keeps goal aggregates and only
   the last numeric/time entry needed for display; full day arrays remain in D1.
7. Atomically claim and send the ready message on the following tick.

Raw capture excludes notes and stored `met` flags. The application recalculates
`met` from frozen tracking rules and values only for the group being evaluated.
Check `false`, quantity `0` and time `00:00` remain records. Full HTTP progress and
preview paths retain their existing detailed calculation and output.

Projection is read-only. Writes compare capture ID, cursor and payload version;
append/summary also constrain owner and pending status. Stale concurrent runners
cannot append twice, overwrite a new generation or replace a more advanced stage.
Final transport claim still checks current settings, ownership, active selection,
link, expiry and version 1. New raw versions 6/7/8 expose negative legacy source
revisions, forcing `d3fdc6c` to rebuild after rollback; they cannot be sent as a
ready message. Existing versions 2/3 resume their frozen inputs, then upgrade to
the new stages. Legacy version 4 and ready version 1 still work.

No table, migration, resource, binding, plan, Cron or logging-policy change is
required. Frozen state uses the existing job payload.

## Month rollover and latency

The previous atomic native month copy remains. Cron now inherits one pending edge
per tick, reducing calendar/scheduling work in each invocation. HTTP preparation
keeps its existing full-recovery behavior. Edited target rules and selections
remain protected by existing inheritance guards.

The projected candidate still had two local inheritance outliers (11.901 and
10.461 ms), dominated by `localParts` in the inspector profiles. Its complete
50-fresh/665-repeated series is retained in
[`reminder-cpu-2026-10-16-projected-candidate-local.json`](reminder-cpu-2026-10-16-projected-candidate-local.json).
The final calendar path caches a derived offset per timezone/UTC day after
checking offsets 36 hours before and after UTC noon. Equal offsets use UTC date
arithmetic. Transition-adjacent days and pre-2000 dates retain Intl; local-time
resolution keeps its existing gap/fold fallback. The bounded cache stores no
owner settings or next-run state. Regression checks compare date/time with Intl
at 1,176 instants across eight zones, DST transitions, a skipped date, year
boundaries, fractional offsets and the historical fallback.

Without backlog, retries, maintenance or quiet hours, G report groups require
about `G + 5` minutes after scheduling: 22 minutes for 17 groups, 29 for 24.
Twenty-four inherited edges require 24 inheritance ticks after the copy tick.
The existing oldest-due queue means a preparing report can delay other reminders.
The first minute of each UTC hour is still reserved for maintenance. Quiet hours
and expiry are enforced at each stage; they can add delay or cancel expired work.

## Verification

Targeted tests cover full/compact output parity, owner isolation, cross-month
ancestry, current tracking rules versus stale stored `met`, frozen facts after
later edits, false/zero/midnight records, concurrent ticks and stale generations,
invalidation at intermediate and ready phases, rollback markers, legacy payload
resumption and exactly one fake send. They also verify one-edge inheritance and
completion of a 30-goal plan across separate Cron ticks.

Workspace `pnpm check` passed: frontend 136, backend 304 and ChatGPT adapter 16
tests, Worker dry-run and monolith smoke. Root `pnpm boundaries:check` passed;
the frontend still has four existing architecture warnings. Node 24.18.0 and
pnpm 11.15.1 match the repository contract. Final local measurements are recorded
below after the code is frozen. Production stability needs a check on the
published revision after separate authorization; the consumed `d3fdc6c`
deployment/report permission does not authorize an additional report or deploy.

## Authorized production control plan

After publishing the checked, pushed revision to the existing Worker `app`,
verify `/health` reports that exact revision and retain the existing bindings,
single Cron, Free scope and disabled invocation logs. No migration is needed.

Outside the ordinary owner's quiet hours, use a new isolated owner with 24
September fixture goals and no current-month rollover receipt. Observe the native
October copy and all 24 one-edge inheritance ticks, checking counts and selection
exclusions. Then make only that isolated owner's weekly schedule due during
synthetic quiet hours; verify postponement with zero transport attempts and
cancel the unsent job. Finally enqueue one uniquely identified test weekly job
for the connected real owner, preserving normal settings, selections and report
slots. Observe selection, capture, every group cursor, separate summary, format
and exactly one send attempt. Do not enqueue another test report to replace an
ambiguous result. The unchanged settings fingerprint and control manifest must
be checked before each remote mutation.

Allow roughly an hour, with a 90-minute control deadline and an explicit cleanup
on failure/interruption. Cancel remaining control jobs; delete the fixture owner
and verify no fixture goals, links, rules or active jobs remain. Retain real sent
history. Check foreign-key integrity and the original owner's settings/schedule
fingerprint. Attribute metrics by minute, deployed version and D1 stage changes;
record sampling and HTTP-attribution limits. A successful delivery alone does not
meet the CPU criterion. If it is already within quiet hours, run this control in
the next permitted daytime window after explicit scheduling authorization.

## Final local measurements

All workspace checks finished before measurement. Runtime sources and profiler
scripts remained unchanged through the final sequential series; SHA-256 source
fingerprints and every observation are in
[`reminder-cpu-2026-10-16-native-stages-local.json`](reminder-cpu-2026-10-16-native-stages-local.json).
The dense fixture has two owners, 24 goals each, 28 facts per goal, four tracking
types, three cadences and three reminder calendars; 19 report groups are included.

Fifty fresh observations cover all 19 calculation positions, with three fresh
observations for each other heavy stage and the first/last calculation positions.
Each observation uses a separate Workerd's first measured Cron invocation;
fixture setup is outside the profile. All are below 10 ms, maximum **8.917 ms**.
This does not establish a Cloudflare isolate cold-start bound.

| Stage | Maximum fresh estimate, ms | Maximum repeated estimate, ms |
| --- | ---: | ---: |
| Weekly scheduling | 4.851 | 3.168 |
| Scheduling during quiet hours | 7.886 | 3.324 |
| Selection | 4.867 | 1.935 |
| Raw capture | 5.776 | 2.073 |
| One calculation group | 8.917 | 4.709 |
| Separate summary | 6.626 | 2.689 |
| Formatting | 6.540 | 2.535 |
| Ready report send, fake transport | 6.415 | 1.969 |
| Month copy | 6.456 | 2.003 |
| One-edge inheritance | 6.061 | **14.176** |

The 15-cycle dense series contains **1,995** measured ticks and two estimates
above 10 ms. The 14.176-ms inheritance profile has only native D1 `fetch` active
samples (recovery batch and inheritance write). The **10.901-ms** post-maintenance
question cancellation profile is dominated by native `enterSpan` (9.459 ms), plus
the local profiler wrapper and native response text. Both complete raw profiles
and sampled stacks are retained. These observations cannot establish whether a
host pause, inspector/native accounting, tracing or actual CPU caused the spikes;
they are not removed from the results or treated as passing samples.

The dense fixture already has question-date entries, so ordinary reminders can
cancel. A separate empty-day uniform fixture exercises actual question/digest
transport branches: **135** repeated ticks, **60** fake sends, no estimate above
10 ms (maximum 4.549 ms). Three separate fresh queued-question sends each send
exactly once: **5.058, 5.699, 3.584 ms**. Thus the final evidence contains 53 fresh
observations and 2,130 repeated ticks, with two repeated overruns. Auxiliary idle
first invocations are retained separately. Both maintenance and a queued send
following maintenance are covered; an unqueued due rule at the maintenance tick
measures maintenance only.

These are V8 inspector active-time estimates with idle/root/program samples
excluded, not Cloudflare billed CPU. No local CPU limit is enforced, and the fake
transport does not model real Telegram networking. All report pipelines and both
owners' full month inheritance finish within the profiler's bounds. Stable
production CPU below 10 ms remains **unproven**; the next useful evidence is the
explicitly authorized production control above, rather than discarding the two
remaining native/tracing peaks.

## Authorized rollout and scheduled control

User authorization covers deployment of `47021ef` and one new control on
17 October at 09:10 Asia/Yekaterinburg: 24 isolated fixture goals, synthetic quiet
scheduling and exactly one additional real test weekly report. The previous
`d3fdc6c` permission/report were consumed separately and are not reused.

[CI 38945660554](https://github.com/DenisChernykh/planner-backend/actions/runs/38945660554)
completed successfully before publishing
`47021ef0f0fc63b028be5e3d6d4619b71e872402`. Cloudflare version
`873fe2c9-bbd5-4e4a-9c98-12044f16f6d6` serves that exact revision; `/health` returned
200 at 18:18:24 UTC. All measured source fingerprints match the published commit.
Pre/post checks confirmed the same D1 binding, settings, observability, single
Cron and ordinary schedule state; backlog and FK violations remained zero.
No migration, resource/plan change or additional Telegram send occurred during
this rollout. Sanitized evidence is in
[`reminder-cpu-2026-10-16-47021ef-rollout.json`](reminder-cpu-2026-10-16-47021ef-rollout.json).

Local thread heartbeat `planner-cpu-17` is active with a one-time schedule for
17 October at 09:10. It checks the exact deployed revision, follows the control
plan above, uses a fresh private manifest and a 90-minute deadline, cleans up on
failure and disables itself after the control. It must not deploy another
revision or enqueue a replacement report after an ambiguous result. The Mac
must be on and the app running for work with local files, as described in the
[official scheduled-task documentation](https://learn.chatgpt.com/docs/automations?surface=app).
No control fixtures have been created for the new run yet; actual CPU results
remain pending.
