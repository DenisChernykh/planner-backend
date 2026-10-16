# Reminder Cron CPU measurements — 13 October 2026

## Observed production failure

Production revision `6d48f07c9a57754c252507e4519568b59e9874c0` had an active
once-per-minute Cron. Cloudflare's `workersInvocationsScheduled` returned 103
invocations between 05:55 and 07:37 UTC on 13 October, all with
`status=exceededResources` and `cpuTimeUs=10000`. An overdue question remained
`pending` with zero send attempts. This establishes resource termination before
delivery; it does not identify an individual function's CPU cost.

Workers Free has a 10 ms CPU budget per Cron invocation. Network and database
waiting are excluded, and occasional overruns have some runtime flexibility.
See [Cloudflare CPU limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).

## Reproducible local measurement

Use Node 24 and pnpm 11.15.1 from the workspace root:

```sh
PLANNER_PROFILE_REF=456f7ad pnpm reminders:profile
pnpm reminders:profile
PLANNER_PROFILE_FIRST_SCENARIO=queued-question pnpm reminders:profile
```

The first command profiles the original source from Git in a temporary directory;
it does not change the checkout. The fixture uses the installed workerd/Miniflare
and esbuild shipped with Wrangler, temporary local D1, two synthetic accounts,
20 goals per account and the default Asia/Yekaterinburg timezone. Twenty goals
are selected for the weekly-report scenario. Each warm scenario has 15 measured
ticks. Telegram is mocked inside the fixture; external network access is denied.
No production data, credentials or real messages are involved.

Set `PLANNER_PROFILE_OUTPUT=/private/tmp/planner-profile` to export individual
DevTools `.cpuprofile` files. `PLANNER_PROFILE_FIRST_SCENARIO` also accepts `idle`,
`question`, `digest` and `weekly-report`. Only the chosen first handler call is
unwarmed; later scenarios share an isolate.

Measurements below sum profile sample deltas after excluding idle/root/program
samples. They are approximate active sampled time, **not Cloudflare CPU billing**:
sampling and native execution make the two non-equivalent. The first call is
measured after worker module loading, not as a complete isolate startup. Local
workerd does not enforce the production Free CPU budget. Do not run unrelated
tests concurrently with profiling. Zero-sample short ticks are possible.

| Scenario | Before: ms | After: ms | D1 statements before → after |
| --- | ---: | ---: | ---: |
| First idle handler call | 44.8 | 4.0 | 14 → 5 |
| Idle tick, median | 4.6 | 1.3 | 14 → 5 |
| Schedule and send one question, median | 7.5 | 4.1 | 23 → 15 |
| Schedule and send a digest, median | 7.2 | 4.5 | 24 → 16 |
| Send an already queued question, median | 6.7 | 2.8 | 21 → 9 |
| Prepare a weekly report, median | 14.7 combined | 7.1 | 37 combined → 19 |
| Send a prepared weekly report, median | same combined call | 3.7 | next tick: 13 |

These are successive isolated runs of the same fixture on the same Mac. In the
final run, warm question P90 was about 11.8 ms, digest 5.5 ms, report preparation
9.1 ms and report delivery 4.6 ms. A first report-preparation sample was 15.2 ms.
Earlier runs had question P90 around 5.5 ms, demonstrating local measurement
variation. A separate first-call queued-question run after removing its Drizzle
query construction measured 7.4 ms. No individual local reading is a production
CPU bound. Report preparation retains less headroom than ordinary reminders;
the local median must not be treated as proof that every production invocation
fits within 10 ms. Monthly rollover CPU,
large fact histories, other cold timezones and larger account counts also need
production measurement before broader reliability claims.

## Implementation

- The HTTP router/OpenAPI registry is constructed on the first HTTP request.
  Cron no longer constructs it eagerly.
- Calendar formatting uses a bounded cache. The default timezone formatter is
  initialized at module startup, removing its large first-invocation cost.
  Luxon still handles next occurrences and DST-sensitive quiet-hour boundaries.
- A single owner-scoped D1 summary identifies due schedules and unprepared
  months or incomplete inheritance. Idle ticks do not repeatedly materialize
  plans, repair every inherited setting, or load every reminder rule.
- Due weekly settings are filtered in D1. Report-only owners with no general
  reminder settings still receive default calendar settings and plan preparation.
- Production Cron saves a new report snapshot without claiming or sending it;
  a later tick revalidates settings and selections before delivery. New snapshots
  avoid fetching their selections and sources twice. Direct report use cases
  retain their combined behavior unless staged preparation is requested.
- The hot reminder persistence path and question goal/fact reads use parameterized
  SQL. Delivery reads only the question's own rule. Revision checks,
  atomic schedule/job insertion and delivery claims remain intact.
- Persisted due work takes priority over another scheduling pass. At most one
  message is processed per tick; simultaneous messages drain over subsequent
  minutes. A delayed question retains its original local date. No extra Cron,
  infrastructure or migration is introduced.
- Runner wiring/transport is reused for identical environment bindings; settings,
  ownership, connection state and claims are still read from D1.
- Digests load facts only for their question date and calculate the weekday once.
  Website plan reads retain full monthly history.

## Authorized production deployment and delivery verification

After local `pnpm check`, production dry-run and the pushed revision's
[successful CI run](https://github.com/DenisChernykh/planner-backend/actions/runs/38371601661),
the owner authorized deployment of `ebbbf202b3e9c4e3a98a3a35745847aee0dd5695`
to the existing Worker `app`. Cloudflare created version
`30161c27-1250-4aee-8a27-5d464653d6f9` at 08:53:49 UTC on 13 October.
`/health` subsequently returned `200` and that exact source revision.

The existing D1 binding, secret bindings and one `* * * * *` Cron were retained;
invocation logs remain disabled. No remote migration, resource creation or plan
upgrade was performed. A read of account subscriptions returned `403`, so billing
tier was not independently verified through that API; Free is the owner's stated
deployment constraint.

Exact `workersInvocationsScheduled` events from 08:54:01 through 09:06:01 UTC
(13:54:01–14:06:01 Asia/Yekaterinburg) showed **13 successes, zero resource
terminations**. These are production CPU measurements, unlike the local samples.

| Observed work | Invocations | CPU, ms | Outcome |
| --- | ---: | ---: | --- |
| First recorded tick after deployment | 1 | 14.702 | success |
| Other ticks, excluding control delivery | 11 | 4.101–7.882; median 4.664 | all success |
| Control question scheduled and delivered at 09:02:01 UTC | 1 | 29.433 | success |

The top-of-hour tick at 09:00:01 UTC used 7.882 ms. The dataset does not expose
isolate identity, so the first recorded invocation cannot be proven to be a cold
isolate. In particular, the successful control delivery exceeded the Free 10 ms
CPU budget. Cloudflare documents flexibility for infrequent overruns, but this
does **not** establish sufficient CPU headroom or reliable Free-tier delivery.
The resource-failure sequence stopped in this observation window; the CPU
acceptance criterion remains unmet for the real question path.

The owner separately authorized one temporary goal titled
“Проверка доставки уведомлений” for the recipient's connected Telegram chat.
Cron scheduled and sent exactly one recorded job at 14:02:01 local time:
`status=sent`, `attempts=1`, message ID present. The owner confirmed that the
question appeared in Telegram and that they pressed “Да”. This confirms client
receipt in addition to Telegram API acceptance; it does not independently verify
that the button response was persisted.

After delivery, the temporary goal was soft-deleted from the active plan and its
reminder switched to `off` with `next_run_at=NULL`. A readback confirmed one sent
job, one attempt and zero pending/sending jobs. Existing goals and settings were
not changed; no old `unknown` or `sent` jobs were replayed. Delivery history was
retained.

## Remaining CPU acceptance work

1. Profile the first question scheduling/delivery path, including native calendar
   work and real Telegram-response handling. The 29.433 ms event cannot be
   attributed to an individual function from scheduled-event metrics alone.
2. Measure more ordinary deliveries and fresh isolates. Do not rely on the
   platform's occasional overrun allowance as the delivery budget. Additional
   synthetic messages require separate authorization; only one was authorized
   for this verification.
3. Observe evening delivery and weekly-report preparation/send, including quiet
   hours and an existing fact that should suppress a question. These paths were
   tested locally but were not exercised by this production control question.
4. Measure monthly rollover and inheritance recovery at the next relevant
   boundary, or use a separately authorized isolated test. Larger histories and
   account counts remain outside this short production observation window.

## Local optimization follow-up — 16 October 2026

The read-only production audit found 1,437 successful scheduled invocations and
zero resource terminations in the preceding 24-hour window. CPU median was
4.976 ms, P95 6.992 ms, maximum 40.502 ms; 16 events exceeded 10 ms. This is the
deployed `ebbbf20` baseline, not production evidence for the changes below.

The next revision bounds a Cron invocation to one schedule transition or one
persisted delivery. Questions/digests are sent on a later tick; weekly reports
have separate schedule, snapshot and send ticks. Month copy and inheritance
also run separately. A single question normally adds about one minute of delay;
simultaneous reminders drain at roughly one per two minutes. The original local
date, expiration, quiet hours, owner scope and uncertain-send handling remain.
HTTP/bot interactions keep immediate delivery behavior.

Delivery settings, connection and rule are read together. Recovery and selecting
due work share one D1 batch. The final atomic claim rechecks connection/settings,
rule revision, goal eligibility and absence of a concurrently entered question fact.
Inheritance uses one SQL insert per generation rather than per goal, preserving
source checks and manual edits. Rollover reads use parameterized SQL. Calendar
formatters and deterministic local-time resolutions have bounded caches; report
date-only arithmetic uses UTC dates. Luxon still resolves IANA gaps and folds.

The profiling fixture now resets scenario state, measures subsequent persisted
stages separately, and includes copying/inheriting 20 goals per owner. One final
run's warm samples (15 per stage) were:

| Stage | Median sampled active ms | P90 ms | D1 statements |
| --- | ---: | ---: | ---: |
| Schedule a question | 1.643 | 2.370 | 6 |
| Send that question | 2.023 | 3.292 | 7 |
| Schedule a digest | 1.458 | 1.904 | 6 |
| Send a digest | 2.636 | 3.982 | 9 |
| Schedule a weekly report | 1.875 | 3.731 | 8 |
| Prepare its snapshot | 3.830 | 6.380 | 12 |
| Send its snapshot | 3.135 | 4.306 | 13 |
| Copy a new month | 2.283 | 3.343 | 10 |
| Inherit its rules | 3.106 | 3.619 | 9 |

Separate first-handler runs measured question scheduling 6.746 ms, queued-question
delivery 6.514 ms, digest scheduling 5.581 ms, weekly scheduling 7.322 ms, month
copy 8.771 ms and inheritance 9.935 ms. Top-of-hour first runs with maintenance
measured 6.671 ms for scheduling and 6.798 ms for queued delivery. These are local
sampled active time after module loading, **not Cloudflare CPU accounting or a
worst-case bound**. The inheritance first run has little measured headroom.
Intermediate implementations still exceeded 10 ms locally, including a 13.147-ms
combined rollover; do not treat selective warm medians as an acceptance gate.

Reproduce with Node 24 / pnpm 11.15.1 and `pnpm reminders:profile`; use
`PLANNER_PROFILE_FIRST_SCENARIO=rollover-inherit` (or `question`, `queued-question`,
`digest`, `weekly-report`, `rollover`, `hour-question`, `hour-queued-question`) for
a separate first-handler case. The fixture uses temporary local D1 and fake
Telegram, with external requests denied. Run profiles sequentially without tests.

This follow-up is not deployed. No remote migrations or Telegram mutations are
needed to publish the code. Separate deployment authorization and real Cloudflare
measurements of naturally due deliveries, fresh isolates, report stages and
monthly work are required before claiming the Free 10-ms CPU target is met.
