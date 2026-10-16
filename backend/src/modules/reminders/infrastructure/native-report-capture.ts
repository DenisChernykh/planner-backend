import type { ProgressReportRepository } from "../application/ports/progress-report-repository";

// Capture raw facts in SQLite, without decoding definitions, facts or ancestry in
// Worker JS. Evaluation is deferred to the one-group calculation tick. Only this
// module's pending job is mutated; planning tables are owner-scoped read sources.
export async function captureReportInputs(
  database: D1Database,
  input: Parameters<ProgressReportRepository["captureSnapshot"]>[0],
): Promise<boolean> {
  const { job, metadata, scope, selectedIds } = input;
  const result = await database
    .prepare(`WITH RECURSIVE ancestry(leaf, id, parent) AS (
      SELECT id, id, carried_from_goal_id FROM plan_goals
        WHERE owner_id = ? AND month BETWEEN ? AND ? AND deleted_at IS NULL
      UNION ALL SELECT a.leaf, p.id, p.carried_from_goal_id FROM ancestry a
        JOIN plan_goals p ON p.id = a.parent AND p.owner_id = ?
    ), roots AS (
      SELECT leaf, id AS root FROM ancestry WHERE parent IS NULL OR NOT EXISTS (
        SELECT 1 FROM plan_goals WHERE id = ancestry.parent AND owner_id = ?)
    ), definitions AS (
      SELECT g.*, coalesce(roots.root, g.id) AS chain_id FROM plan_goals g
        LEFT JOIN roots ON roots.leaf = g.id
      WHERE g.owner_id = ? AND g.month BETWEEN ? AND ? AND g.deleted_at IS NULL
      ORDER BY g.month, CASE g.cadence_period WHEN 'day' THEN 0 WHEN 'week' THEN 1 ELSE 2 END,
        g.sort_order, g.id
    ), selected AS (SELECT value AS id FROM json_each(?)), source_rows AS (
      SELECT json_object('id', g.id, 'chainId', g.chain_id, 'month', g.month,
        'title', g.title, 'tracking', json(g.tracking_config), 'cadence', json(CASE
          WHEN g.cadence_period = 'day' THEN json_object('period', 'day')
          ELSE json_object('period', g.cadence_period, 'targetOccurrences', g.target_occurrences) END),
        'entries', json((SELECT json_group_array(json_object('date', e.local_date,
          'value', json(e.value))) FROM goal_entries e WHERE e.goal_id = g.id))) AS source
      FROM definitions g WHERE g.id IN (SELECT id FROM selected)
      ORDER BY g.month, CASE g.cadence_period WHEN 'day' THEN 0 WHEN 'week' THEN 1 ELSE 2 END, g.sort_order, g.id
    ) UPDATE reminder_jobs SET payload = json_set(?, '$.goals', json('[]'), '$.offset', 0,
      '$.nextChainId', (SELECT json_extract(source, '$.chainId') FROM source_rows
        WHERE json_extract(source, '$.id') IN (SELECT value FROM json_each(?)) LIMIT 1),
      '$.calculation', json_set(?,
      '$.sources', json((SELECT json_group_array(json(source)) FROM source_rows)),
      '$.knownSources', json((SELECT json_group_array(json_object('chainId', chain_id,
        'month', month)) FROM definitions))))
    WHERE id = ? AND owner_id = ? AND status = 'pending' AND payload = ?`)
    .bind(
      job.ownerId,
      scope.fromMonth,
      scope.toMonth,
      job.ownerId,
      job.ownerId,
      job.ownerId,
      scope.fromMonth,
      scope.toMonth,
      JSON.stringify(selectedIds),
      JSON.stringify(metadata),
      JSON.stringify(metadata.goalIds),
      JSON.stringify(scope.calculation),
      job.id,
      job.ownerId,
      job.payload,
    )
    .run();
  return result.meta.changes === 1;
}
