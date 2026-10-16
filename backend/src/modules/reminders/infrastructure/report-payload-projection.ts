// Keep large frozen inputs and finished goal results in D1. Cron receives only
// the current chain's facts, or aggregate counters on the separate summary tick.
// This is a read projection; generation/cursor compare-and-swap guards writes.
const goals = "json_each(payload, '$.goals')";
const days = `${goals} goal, json_each(goal.value, '$.days') day`;
const totals = `json_object(
  'goalCount', json_array_length(payload, '$.goals'),
  'met', (SELECT coalesce(sum(json_extract(value, '$.met')), 0) FROM ${goals}),
  'dailyRecords', (SELECT coalesce(sum(json_extract(value, '$.records')), 0) FROM ${goals} WHERE json_extract(value, '$.cadence.period') = 'day'),
  'dailyDays', (SELECT coalesce(sum(json_extract(value, '$.eligibleDays')), 0) FROM ${goals} WHERE json_extract(value, '$.cadence.period') = 'day'),
  'eligibleDates', json((SELECT json_group_array(DISTINCT json_extract(day.value, '$.date')) FROM ${days} WHERE json_extract(day.value, '$.state') NOT IN ('excluded', 'future'))),
  'recordedDates', json((SELECT json_group_array(DISTINCT json_extract(day.value, '$.date')) FROM ${days} WHERE json_type(day.value, '$.value') != 'null'))
)`;

// Formatting uses aggregate goal results and only the last quantity/time entry.
// Preserve those entries' dates and JSON value types, including numeric zero.
const renderGoals = `json((SELECT json_group_array(json_set(goal.value, '$.days', json((
  SELECT json_group_array(json(value)) FROM (
    SELECT day.value FROM json_each(goal.value, '$.days') day
    WHERE (json_extract(goal.value, '$.tracking.type') = 'quantity' AND json_type(day.value, '$.value') IN ('integer', 'real'))
       OR (json_extract(goal.value, '$.tracking.type') = 'time' AND json_type(day.value, '$.value') = 'text')
    ORDER BY day.key DESC LIMIT 1
  )
)))) FROM json_each(payload, '$.overview.goals') goal))`;

export const reportPayloadProjection = `CASE
  WHEN kind = 'weekly-progress' AND json_type(payload, '$.captureId') = 'text'
    AND json_extract(payload, '$.version') IN (6, 7)
  THEN json_set(json_remove(payload, '$.goals'), '$.calculation.sources', json((
    SELECT json_group_array(json_set(source.value, '$.entries', json(CASE
      WHEN json_extract(source.value, '$.chainId') = json_extract(payload, '$.nextChainId')
      THEN json_extract(source.value, '$.entries') ELSE '[]' END)))
    FROM json_each(payload, '$.calculation.sources') source)))
  WHEN kind = 'weekly-progress' AND json_type(payload, '$.captureId') = 'text'
    AND json_extract(payload, '$.version') = 8
  THEN json_set(json_remove(payload, '$.goals'), '$.totals', ${totals})
  WHEN kind = 'weekly-progress' AND json_type(payload, '$.captureId') = 'text'
    AND json_extract(payload, '$.version') = 4
  THEN json_set(payload, '$.overview.goals', ${renderGoals})
  ELSE payload END`;
