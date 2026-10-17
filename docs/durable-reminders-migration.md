# Durable reminder executor — 17 October 2026

The owner approved replacing the minute-by-minute CPU workaround with a
SQLite-backed Durable Object on Cloudflare Free, in the existing Worker `app`.
The implementation was verified locally first. The owner separately authorized
deployment on 17 October; the production record is below. Test sends, remote D1
migrations and paid-plan changes were not part of that deployment.

## Execution

The existing once-per-minute Cron calls only
`REMINDER_SCHEDULER.getByName("reminders").wake()`. It does not load application
data, calculate progress, inherit goals or call Telegram. There is one executor
object for the existing personal-use capacity assumption; accounts remain
owner-scoped and no designated-owner allowlist is introduced.

`wake()` only restores a missing alarm. A short storage critical section prevents
concurrent wake calls from postponing an existing alarm. While an alarm is doing
external I/O, wakes do not interfere with it. The platform serializes alarm
handlers; the handler deliberately does not hold `blockConcurrencyWhile` across
the network batch and its wall-clock timeout.

An alarm first persists its next recovery time, normally one minute ahead. It
does hourly maintenance in the same invocation, schedules all due reminders and
reports, prepares whole plans and whole reports, and delivers up to 20 separate
jobs. More due jobs schedule the next alarm one second later. The batch limit
leaves room below Free's external subrequest cap; there is no per-goal CPU stage.
Each next job reads fresh D1 eligibility and current time, including after network
calls cross a quiet-hours boundary.

Failure preserves a future alarm and emits only a sanitized event. Cron remains
a bootstrap/recovery heartbeat even if the platform exhausts automatic alarm
retries. `maintenanceHour` is the only application metadata stored in the DO;
settings, scheduling, snapshots, claims, attempts and delivery history stay in D1.
Eviction/recreation does not depend on an in-memory work cursor or owner settings.

## Removed

- Selection/capture/calculation/summary/render stages spread over Cron minutes.
- Payload preparation versions 2–8, calculation cursors and raw fact payloads.
- The native report-capture writer, per-chain JSON read projections, SQL summary
  projections and generation/cursor-specific compare-and-swap methods.
- Separate copy and one-edge inheritance ticks, deferred scheduling/delivery flags,
  and the five-rule scheduling cap.
- Custom timezone offset/day/minute caches, startup prewarming and cached occurrence
  resolution. Luxon now performs the calendar operations directly; DST gap/fold
  behavior remains covered by tests.
- Duplicate lazy Cron wiring, the wiring WeakMap, and the dedicated retention-only
  minute that delayed ordinary delivery.
- The obsolete staged CPU profiler scripts and `reminders:profile` command. Dated
  evidence remains historical; those old commands can be run from the recorded
  commits. `reminders:compare-do` now explicitly compiles its archived `5e0d309`
  runtime to reproduce the prototype without retaining the old production pipeline.

## Retained

- Atomic D1 delivery claims, event-key uniqueness and settings/selection guards.
- A compact **ready version-1 snapshot** for a confirmed retry. Editing facts
  after preparation does not silently change the retry message.
- `unknown` after ambiguous transport results or an expired sending lease; no
  blind resend after a possible external acceptance.
- Owner isolation, disconnected/blocked chats, quiet hours, expiry, future starts,
  original report periods and inherited explicit exclusions.
- Transactional SQL month copy and guarded native inheritance writes. These are
  useful for atomicity and avoiding read/write races, not just the old CPU target.
- Combined D1 eligibility reads and one-query owner-scoped progress sources.
- Linear report-size accounting and calculation-local entry/calendar indexing.
  They reduce repeated work in ordinary Progress as well as reports, with no
  persisted staging protocol.
- Bounded retention deletes, so maintenance does not create a bulk deletion/write
  spike. Maintenance no longer consumes an entire delivery minute.
- The small Telegram transport adapter, which also avoids token-bearing upstream
  errors in logs, and lazy creation of the HTTP router on the HTTP path.

## Existing jobs and rollout

No D1 schema migration is required. Unsent legacy intermediate payloads (versions
2–8) are rebuilt once from current owner-scoped data when due. They never represented
a send attempt, and cannot pass the version-1 claim. A ready version-1 message is
reused if settings and selection still match. `sending`, `unknown`, `sent` and
cancelled history retain the existing recovery policy. Atomic claims protect a
temporary overlap with the old Cron revision during a rollout.

`backend/wrangler.jsonc` declares the local and production namespace binding and
the platform migration tag `v1-reminder-scheduler` with `new_sqlite_classes`.
The name `app`, account, D1 binding/ID, assets, single Cron, secrets and disabled
invocation logs remain unchanged. There is no paid plan, extra Worker, Queue, KV,
R2, Redis or external database. Namespace declaration is not namespace creation
on the hosted account; that happens only with an authorized deployment.

A future authorized publish must deploy the checked/pushed revision with this
SQLite class migration, verify `/health`, the namespace and unchanged bindings,
then observe Cron bootstrap and alarm processing. Keep rollback safety in mind:
reverting code alone may leave a hosted DO namespace/alarm present. Check running
versions and active work explicitly before any rollback; no namespace deletion or
remote job cancellation is authorized by this implementation task.

Free quotas apply to the entire account, not only this executor. The normal
minute heartbeat is about 1,440 Cron invocations and 1,440 alarms per day, plus
backlog/failure runs; it is not a measured production usage projection. DO compute
duration includes waiting on I/O, unlike the active CPU limit. Hosted quota use,
network latency, cold starts and CPU still need separate verification. See
[limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[Free quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/)
and [alarm semantics](https://developers.cloudflare.com/durable-objects/api/alarms/).

## Local verification

Regression tests cover whole report generation, byte-equivalent preview output,
cross-month owner isolation, stale stored `met`, false/zero/midnight facts,
legacy payload conversion, version-1 retry snapshots, concurrent claims, changed
settings and selection, quiet hours and expiry. Rollover tests verify all 30 rules
and selections are inherited together, with separate delivery batching.

The production-shaped DO binding is tested for Cron delegation, concurrent wake
calls, preservation of alarms through eviction, hourly maintenance, a 24-message
backlog, whole report delivery with questions disabled, replay without duplicate
sends, and recovery after a D1 failure. Test
alarms run under controlled fixture clocks and transports; none call real Telegram.

Passed locally: root `pnpm check` (297 backend tests, 136 frontend tests,
16 plugin tests, module checks, builds, type generation, local Wrangler dry-run
and monolith smoke), root `pnpm boundaries:check`, production `pnpm deploy:dry-run`,
and a pinned historical
comparison smoke (`--rounds 1 --scenarios report`, all three modes plus
restart/replay checks). Passing local gates does not establish GitHub CI or hosted
behavior. These local checks performed no deploy, remote migration or real
Telegram send.

## Production deployment — 17 October 2026

Published code revision `94b1fe77ab23e558bf411c54bf1992d6e20e5382` to the existing
Worker `app` at 06:14:53 UTC after the owner's explicit deployment request.

- Version: `4888c2c2-0df6-4228-845e-daf945a93701`.
- Deployment: `77f3b345-a3d6-4b80-b907-0134ed13a971`, 100% traffic.
- Previous version: `873fe2c9-bbd5-4e4a-9c98-12044f16f6d6`.
- Applied platform migration: `v1-reminder-scheduler` (SQLite).
- Namespace: `d520d811b99643cc95e1faac04d1cb45`, class `ReminderScheduler`,
  binding `REMINDER_SCHEDULER`.

Cloudflare version metadata confirms all previous bindings are unchanged, except
`BUILD_REVISION`, which now identifies the full deployed commit. D1 and the five
secret bindings remain the same. The deployment confirms the sole schedule
`* * * * *`; no D1 schema migration or webhook mutation was run.

Production `/health` returned 200 with the full revision. `/` and
`/plans/2026-10/progress` matched the built SPA; OpenAPI returned 200,
unauthenticated `/api/auth/me` returned 401, and a missing API route returned 404.
Filtered live traces confirmed two successful invocations each of Cron,
`ReminderScheduler.wake` and alarm, with no exceptions or log messages. The
observer excluded request URLs, headers and log contents. No manual reminder or
Telegram test send was invoked; ordinary scheduled
processing remains enabled. This does not establish a real report delivery or
long-term Free quota usage.
