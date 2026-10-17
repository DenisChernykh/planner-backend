# Local Durable Object comparison

This is the historical local prototype that preceded the architecture migration.
It uses the installed Miniflare/workerd, local D1 and SQLite-backed Durable Objects.
Runtime imports are compiled from Git revision `5e0d309`, extracted to a temporary
directory. The obsolete staged implementation is no longer kept in production
source. A clone must contain that commit (fetch history if using a shallow clone).
This command neither modifies current production sources/configuration nor deploys.
No Cloudflare account, secret file, remote database or real Telegram token is read.

Run from the workspace root with Node 24 and pnpm 11.15.1:

```sh
pnpm reminders:compare-do --rounds 5 --output /private/tmp/planner-do-comparison.json
```

The command first typechecks the experiment. It requires permission to open local
loopback ports for workerd and the inspector. It installs no dependencies.
Optional `--goals 24`, `--scenarios report,rollover` and
`--modes cron,do-staged,do-direct` select fixture size and measured paths.
Rounds are bounded to 1–20; goals per owner to 4–100. An explicit output path
writes both a JSON report and a sibling compressed raw CPU profile archive.
Temporary D1/DO stores and the compiled Worker are removed on completion/failure.

## Paths under comparison

| Mode | Application execution | Executor |
| --- | --- | --- |
| `cron` | Historical `scheduled()` entry point at `5e0d309`, one bounded transition per call | Local Worker HTTP wrapper invokes `scheduled()` |
| `do-staged` | Same `scheduled()` entry point, draining bounded transitions without minute pauses | One actual workerd `alarm()` |
| `do-direct` | Existing reminder runner with both defer flags off; full report preparation and month inheritance | One actual workerd `alarm()` |

There is no new report algorithm and no fork of product rules. The non-deferred
path exists in the archived application code. This separates removing minute gaps
from removing the repeated reads/writes required by bounded stages.

Both paths use the existing Telegram transport adapter. Miniflare's outbound
service accepts only the hardcoded synthetic bot's `sendMessage` URL and returns
a local fake response. Every other outbound request fails. Even the allowed URL
never reaches Telegram. The ambiguous-send fixture records simulated acceptance
and returns an unreadable response, exercising the existing `unknown` policy.

The experiment is not reachable from the production entry point and has no
deployment configuration. Its local control routes must never be exposed in a
hosted Worker. The object is a single fixture executor, not a finished per-owner
scheduler. The drain has a 200-transition bound and a 30-second host deadline;
an incomplete fixture fails rather than being reported as completed.

## Fixture and correctness

Each measured observation starts a new local runtime and isolated persisted
stores. The fixture has two owners, 24 goals per owner by default, four tracking
types, three cadences, three reminder calendars and 28 entries per goal. Every
fifth goal is excluded from reports. Stored `met` flags deliberately differ from
some values, so the application must calculate the report from rules and facts.
The other owner acts as an isolation sentinel. No user data is copied.

Six scenarios cover a weekly report, month rollover for both owners, scheduling
during quiet hours, a queued question, ambiguous report delivery and an expired
question. Assertions check completion, job status/attempt count, exactly one or
zero fake sends, intended recipient, FK integrity, and preservation of excluded
goals. Transport payloads (including HTML and buttons) must match byte-for-byte
across modes. Rollover definitions, rules, next-run times and selections must also
match after normalizing away generated goal IDs.

Additional unmeasured checks repeat terminal/postponed scenarios, restart the
runtime after staged report raw capture (version 6), resume the same object and
persisted D1 snapshot, and replay completed work without a second send. These
are controlled checkpoint/replay checks, not a crash at every instruction or
proof of exactly-once delivery to a real external service.

## Measurement boundaries

- All modes run sequentially, with rotated order across rounds; fixture setup,
  migrations and correctness checks are outside measured intervals.
- Modules and the DO instance are loaded before capture; the first application
  runner execution is measured. This is not an isolate cold-start measurement.
- CPU is the sum of V8 inspector active sample deltas, excluding idle/root/program
  samples. Zero means no active samples, not zero CPU. Raw profiles are retained.
  This is not Cloudflare billed CPU, and no Free-tier CPU limit is enforced locally.
- Host elapsed time covers actual work and local dispatch. The DO path includes
  a deliberate 25-ms delay to arm a real alarm, plus DO persistence and a local
  result callback. No code directly calls `alarm()`.
- Baseline state observation is outside capture. The DO drain uses one fixture
  completion query after each transition; these are counted separately from
  application D1 statements, but their CPU is included. DO storage operations
  are not counted as D1 statements. A D1 batch counts each constituent statement.
- The logical application time is fixed for exact message parity. Baseline
  transitions execute immediately; the report separately **models** the minute
  gaps as `(calls - 1) * 60 seconds`. It does not claim to have observed those
  minutes elapsing. Backlog, hourly maintenance and quiet-hours delays can add
  further latency in production.
- Executable source hashes and the base Git revision are checked before/after
  the run. JSON stores all observations; the sibling gzip stores all raw profiles.

The existing ordinary Worker HTTP path would still have Free-tier CPU limits.
A future design must keep heavy work in the DO instead of moving it into an API
request. Hosted alarm behavior, Free quotas, location/network effects, scheduling
changes, ownership partitioning and operational recovery need a separate design
and explicit deployment authorization. This prototype proves none of those by
itself.

References: [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[Free quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[alarm semantics](https://developers.cloudflare.com/durable-objects/api/alarms/).

The [17 October comparison](../../docs/durable-reminders-2026-10-17.md) contains
the measured results, all observations and raw profiles.
