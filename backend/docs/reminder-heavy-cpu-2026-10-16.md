# Weekly reports and month rollover CPU — 16 October 2026

**The published revision is not verified to keep these scenarios below 10 ms.**
First-use weekly report preparation repeatedly exceeded 10 ms in local workerd.
A first-use month-copy sample also exceeded it. These are local CPU sampling
estimates, not measured Cloudflare CPU or observed production terminations.

## Revision and production evidence

The checked application source is
`d298b60e142863be896977c48882a644dc8c071f`, deployed to the existing Worker `app`
as version `36a7ed41-0bc7-4726-8050-543331540df2` on 16 October at 14:55:53 UTC.
The repository was clean and synchronized with `origin/main` at the start.

A read-only audit at 15:10:18 UTC found zero weekly report jobs and zero month
rollover markers created since that deployment. One connected account has reports
enabled; the next ordinary slots are 18 October and 21 October at 21:00
Asia/Yekaterinburg. No identifiable real report/rollover execution is available
for this revision yet. The seven successful production Cron samples in the
[previous control](reminder-cpu-2026-10-13.md) covered questions and retention,
not these heavy scenarios.

Only local fixtures and read-only production queries were used in this check.
No application source, production data, schedules, deployments or Telegram
messages were changed.

## Local verification

Node 24.18.0, pnpm 11.15.1, current workerd and the published source extracted
from Git were used sequentially, without concurrent test runs. The V8 profiler
samples at 100 microseconds; totals exclude idle/root/program samples. Local
limits are not enforced, and sample deltas can vary with garbage collection and
host scheduling. A local result below 10 ms is not a production acceptance gate.
[Cloudflare's CPU limit](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)
for Free Cron invocations is 10 ms; network/database waiting time is excluded.

The strengthened profiler has two synthetic owners with 24 goals each:

- `uniform`: daily time goals, no entries, all 24 selected for reports.
- `mixed`: check, quantity, scale and target-time goals; daily, weekly and monthly
  cadence; 28 valid October entries per goal; three reminder calendars. There
  are 19 included goals and five explicit exclusions per owner, with every
  tracking type represented among the included goals.

The mixed report date is 28 October and its week reaches into November. The
month test simulates 1 November. The real production clock is never overridden.
Setup and state assertions run outside the profiled interval. Both synthetic
owners must finish copying goals and inheriting reminder/report settings.
Reports must build a nonempty version-1 snapshot; fake sends must finish with
one attempt and `sent`, rather than silently cancelling the job. External
network requests are denied.

Ready-report first-use measurements load a real snapshot produced by a separate
workerd process. Preparing the snapshot in the measured process would warm its
runtime and obscure the first-use cost.

| Mixed scenario | First use min–max ms | First-use samples above 10 | Warm median ms | Warm maximum ms |
| --- | ---: | ---: | ---: | ---: |
| Schedule weekly report | 6.464–7.327 | 0 / 3 | 2.375 | 4.862 |
| Prepare report snapshot | **15.325–23.629** | **4 / 4** | 5.936 | 9.393 |
| Send prepared report | 6.490–7.691 | 0 / 3 | 2.372 | 5.166 |
| Copy month | **5.471–10.507** | **1 / 3** | 2.688 | 4.703 |
| Inherit reminder/report settings | 6.620–8.707 | 0 / 3 | 3.003 | 4.397 |

Each report stage has 30 warm samples. Full month pipelines cover both owners:
60 copy samples and 120 inheritance samples, including the standalone
inheritance-recovery scenario. First-use preparation includes its three dedicated
fresh-process runs plus the first call preceding the warm batch.

The uniform control also exceeded 10 ms on first report preparation in two of
four runs (maximum 11.038 ms). Its warm inheritance runs retained two isolated
estimates above 10 ms out of 120 samples (12.984 and 21.257 ms). They are retained
in the data, not discarded as inconvenient outliers. The repeatable mixed
first-preparation exceedance is the strongest current risk signal.

Samples and fixture metadata are preserved in
[`reminder-cpu-2026-10-16-heavy-local.json`](reminder-cpu-2026-10-16-heavy-local.json).
Profiles point to progress calculation/calendar traversal, report number/date
formatting, D1 decoding and allocation/garbage collection. Caching formatting
machinery and reducing the first snapshot's work are candidates for a subsequent
optimization; this verification does not claim such a fix.

### Reproduce

Run the following sequentially. The second command uses the real fixture
snapshot from the first, without warming the second Worker:

```sh
PLANNER_PROFILE_REF=d298b60 PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24 PLANNER_PROFILE_FIRST_SCENARIO=weekly-report-prepare PLANNER_PROFILE_FIRST_ONLY=1 PLANNER_PROFILE_SNAPSHOT_OUTPUT=/private/tmp/planner-weekly-snapshot.json pnpm reminders:profile
PLANNER_PROFILE_REF=d298b60 PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24 PLANNER_PROFILE_FIRST_SCENARIO=weekly-report-send PLANNER_PROFILE_FIRST_ONLY=1 PLANNER_PROFILE_SNAPSHOT=/private/tmp/planner-weekly-snapshot.json pnpm reminders:profile
PLANNER_PROFILE_REF=d298b60 PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24 PLANNER_PROFILE_FIRST_SCENARIO=rollover pnpm reminders:profile
PLANNER_PROFILE_REF=d298b60 PLANNER_PROFILE_WORKLOAD=mixed PLANNER_PROFILE_GOALS=24 PLANNER_PROFILE_FIRST_SCENARIO=rollover-inherit pnpm reminders:profile
```

`PLANNER_PROFILE_SCENARIOS=weekly-report,rollover,rollover-inherit` selects the
warm stage pipelines; `PLANNER_PROFILE_ITERATIONS=30` sets their repetition
count. `PLANNER_PROFILE_OUTPUT` saves individual `.cpuprofile` files. No remote
database or real bot token is used by this profiler.

## Concrete production control, awaiting authorization

The following control can run on the existing published revision, D1 and Cron.
It needs no deployment, migration, paid resource or additional Cron. Root
`AGENTS.md` requires explicit authorization for Telegram mutations; prior
authorization covered one already-completed question, not a weekly report.

1. Verify `/health` still reports the full `d298b60` revision, the same D1 is
   bound, the queue is empty and the connected report account is unambiguous.
   Save existing report slot/revision/selection fingerprints for final readback.
   Do not change that account's settings, selections, goals or ordinary event keys.
2. Create one isolated synthetic owner in the existing D1, with 24 goals in the
   previous month, four tracking types, three calendars and explicit report
   inclusions/exclusions. General reminders stay disabled. Reports have future
   slots, and the synthetic connection has an invalid, unique fixture chat ID.
   Its quiet hours cover 00:00–23:59; abort setup near the end of that interval.
   This prevents the later synthetic report from becoming sendable during the
   control, even if observation is delayed. Activate only after setup is complete.
3. Let ordinary Cron copy the unprepared current month, then inherit the
   synthetic settings on separate invocations. Read back 24 target goals,
   24 inherited reminder rules and 24 report selections, including exclusions.
   This exercises the rollover algorithm for an unprepared current month;
   it does not simulate a real midnight/month-boundary clock in production.
4. Make only the synthetic report slot due. Observe the normal scheduling tick
   create its pending job, deferred by the synthetic quiet hours. Cancel this
   unsent job before proceeding; it must have zero attempts and no message ID.
5. Enqueue one separate control report for the real connected report account,
   with a fresh `cpu-control:…:wed` key, the current local date and ordinary
   expiry. The account's report settings remain unchanged. Its existing selected
   goals and history drive the normal snapshot and send ticks. At most one
   additional Telegram report is allowed; no direct Bot API test sends or
   automatic retries of ambiguous sends are permitted.
6. On completion or a bounded test deadline, cancel only unsent control work and
   delete the synthetic owner and its cascading fixture rows. Preserve the real
   control job's sent/uncertain history. Confirm zero fixture rows, no pending
   control work, no foreign-key violations and unchanged ordinary configuration.
   Record actual scheduled CPU and version-grouped metrics for all stages. An
   invocation over 10 ms fails the CPU criterion even when Cloudflare reports
   `success` through its occasional-overrun allowance.

The synthetic stages use existing Cron capacity and can delay simultaneous
scheduling work by a few ticks. If report preparation hits CPU termination,
cancel the pending test job rather than letting it block later reminders through
repeated attempts. A failed control is evidence to optimize, not a reason to
change the plan tier or add infrastructure.
