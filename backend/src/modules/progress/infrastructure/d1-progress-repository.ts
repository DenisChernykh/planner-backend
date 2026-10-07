import type { ProgressRepository, ProgressSettings } from "../application/progress";

export class D1ProgressRepository implements ProgressRepository {
  constructor(private readonly database: D1Database) {}

  async settings(ownerId: string): Promise<ProgressSettings> {
    return (
      (await this.database
        .prepare("SELECT starts_on AS startsOn, revision FROM progress_settings WHERE owner_id = ?")
        .bind(ownerId)
        .first<ProgressSettings>()) ?? { startsOn: null, revision: 0 }
    );
  }

  async save(ownerId: string, startsOn: string | null): Promise<ProgressSettings> {
    const saved = await this.database
      .prepare(`INSERT INTO progress_settings (owner_id, starts_on, revision) VALUES (?, ?, 1)
      ON CONFLICT(owner_id) DO UPDATE SET starts_on = excluded.starts_on, revision = revision + 1
      RETURNING starts_on AS startsOn, revision`)
      .bind(ownerId, startsOn)
      .first<ProgressSettings>();
    if (!saved) throw new Error("Progress settings not saved");
    return saved;
  }
}
