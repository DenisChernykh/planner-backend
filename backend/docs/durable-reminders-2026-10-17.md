# Local Durable Objects comparison — 17 October 2026

The local prototype favors running heavy jobs through the existing non-deferred
application path in a Durable Object. Moving the same small Cron stages into an
alarm removes the minute gaps but retains all their application D1 statements.
Running a whole report or month preparation removes most of those statements.
This is a local result, not evidence of hosted reliability or measured Cloudflare CPU.

The preceding production control completed and was pushed as `9adab25` before
prototype implementation started. That commit is the baseline Git revision;
production runtime source remains unchanged. The source hashes in the evidence
also identify the prototype, package manifests and lockfile before its commit.
Before/after hashes and HEAD equality were asserted during measurement.

## Results

Five sequential repeats of six scenarios in three modes produced **90 measured
scenario runs and 575 raw CPU captures**. Mode order rotated by round. Every run
used fresh local workerd, D1 and DO state: two owners, 24 mixed goals each, 28
entries per goal and 19 included report goals for the reporting owner.

Values below are medians of five runs. "Local processing" sums measured host
elapsed time without simulated minute sleeps. CPU sums V8 inspector active
sample estimates over the entire scenario, not the maximum of a single Cron tick.
The DO measurement includes a deliberately configured **25-ms alarm arming
delay**. Application D1 statements exclude the separately shown fixture observer.

### Weekly report, 19 included goals

| Execution | Executor calls | Application D1 statements | Observer statements | Local processing, ms | Total sampled active time, ms | Modeled minute gaps |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Current Cron | 25 | 102 | 0 | 82.776 | 60.354 | 24 minutes |
| DO, same staged path | 1 alarm | 102 | 25 | 77.045 | 45.877 | None |
| DO, non-deferred path | 1 alarm | 16 | 1 | 39.072 | 10.413 | None |

The non-deferred path uses about **84% fewer application D1 statements**. Its
median local elapsed time is about **2.1 times shorter**, despite the additional
25-ms arming delay. The active-time estimate is about 5.8 times lower in total;
this is a diagnostic local comparison, not a billed-CPU speedup claim.

The baseline's 24 minutes are **modeled scheduling gaps**, not observed time
spent waiting in this benchmark. Production can additionally wait for minute
alignment, maintenance, backlog and quiet hours. The measured ~39 ms for the DO
is also not a promise of hosted delivery latency.

### Month rollover, 48 goals across two owners

| Execution | Executor calls | Application D1 statements | Observer statements | Local processing, ms | Total sampled active time, ms | Modeled minute gaps |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Current Cron | 50 | 298 | 0 | 121.852 | 65.049 | 49 minutes |
| DO, same staged path | 1 alarm | 298 | 50 | 93.116 | 50.801 | None |
| DO, non-deferred path | 1 alarm | 16 | 1 | 34.440 | 7.841 | None |

The direct path uses about **95% fewer application D1 statements** and about
3.5 times less local elapsed processing time. Copied definitions, reminder
calendars, next-run times and inclusions/exclusions match across all three modes.

### Small jobs and delivery policy

| Scenario | Expected final state in all modes | Fake transport calls per run |
| --- | --- | ---: |
| Weekly report | `sent`, one attempt | 1 |
| Queued question | `sent`, one attempt | 1 |
| Quiet-hours report | `pending`, postponed beyond the fixture time, zero attempts | 0 |
| Ambiguous report response | `unknown`, one attempt; replay does not resend | 1 |
| Expired question | `cancelled`, zero attempts | 0 |
| Month rollover | Both owners fully copied/inherited, exclusions preserved | 0 |

For a short queued question, median local elapsed time is 6.205 ms for Cron,
30.395 ms for the staged DO and 32.024 ms for the direct DO. The deliberate
25-ms arming delay explains much of this difference. The experiment does not
support claiming a DO improves every individual operation.

All transport payloads, including HTML and buttons, match byte-for-byte across
modes. FK checks pass; the second owner's data never produces an unintended
message. There are 45 fake transport calls in measured runs, plus two during
the separate restart/replay checks, and **zero real Telegram calls**.

The **48 additional unmeasured assertions/check records** include policy replay
for quiet, expired and ambiguous jobs, recreation of workerd with the same D1
and SQLite DO stores after raw report capture (version 6), continuation to one
fake send, and replay of completed work without a second send. This demonstrates
checkpoint recovery and policy preservation for these cases; it does not test
every crash window or establish exactly-once external delivery.

## Interpretation and limits

The evidence supports exploring a DO executor for reports and month preparation.
The largest deterministic improvement comes from removing repeated application
database work, not from substituting one runtime label for another. Existing
application rules and the transport adapter were reused without changing
production code.

Five observations per combination are a small synthetic sample. Outliers remain
in the evidence: direct ambiguous-send active estimates range from 10.205 to
37.794 ms; a staged short question reaches 26.288 ms, and a direct expired job
reaches 27.540 ms. Nothing is discarded for exceeding 10 ms. Inspector sampling,
native operations and host scheduling are not equivalent to Cloudflare billing.
The benchmark does not enforce any plan's CPU budget or establish a hosted bound.

The staging control includes one completion-observer query per transition,
whereas baseline observation occurs outside capture. DO persistence, callback
and HTTP dispatch are part of the local measurement. CPU samples omit
idle/root/program; zero samples mean an unobserved interval, not zero work.
Source modules and the DO instance are loaded before measurement, so startup
and cold-isolate costs are outside this comparison.

This prototype uses one fixed logical instant to keep payloads identical and
does not implement a production scheduler, per-owner DO partitioning, backlog
fairness, configuration-change wakeups or a crash at every instruction. A future
implementation needs a design for those responsibilities and Free-tier request,
duration and storage accounting. The ordinary API Worker retains its own CPU
limits. No resource creation, production config change, deployment, remote
migration or real Telegram mutation was performed.

## Reproduce and inspect

```sh
pnpm reminders:compare-do --rounds 5 --output /private/tmp/planner-do-comparison.json
```

- [Prototype, safety boundaries and method](../experiments/durable-reminders/README.md)
- [All observations, checks and source fingerprints](durable-reminders-2026-10-17-local.json)
- [All 575 raw CPU profiles, gzip JSON](durable-reminders-2026-10-17-local-profiles.json.gz)

Decompress the profile archive to a JSON array. Each item has a scenario, mode,
capture label and standard V8 `profile`; save an item's `profile` as
`capture.cpuprofile` to inspect it in DevTools.

The prototype's dedicated TypeScript check and complete local comparison pass.
Root `pnpm check` passes: 136 frontend tests, 304 backend tests, 16 ChatGPT adapter
tests, the Worker dry-run and monolith smoke. Root `pnpm boundaries:check` passes;
existing frontend warnings remain. The new root command also passes a separate
one-scenario invocation. These are local checks, not GitHub CI or production
validation.
