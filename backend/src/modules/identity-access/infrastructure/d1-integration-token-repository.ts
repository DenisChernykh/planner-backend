import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { chatgptConnections, users } from "../../../platform/database/schema";
import type {
  IntegrationConnection,
  IntegrationTokenRepository,
} from "../application/ports/integration-token-repository";

export class D1IntegrationTokenRepository implements IntegrationTokenRepository {
  private readonly database;

  constructor(binding: D1Database) {
    this.database = drizzle(binding);
  }

  async connection(ownerId: string, now: number) {
    const [row] = await this.database
      .select({ createdAt: chatgptConnections.createdAt, expiresAt: chatgptConnections.expiresAt })
      .from(chatgptConnections)
      .where(and(eq(chatgptConnections.ownerId, ownerId), gt(chatgptConnections.expiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  async replace(ownerId: string, tokenHash: string, connection: IntegrationConnection) {
    await this.database
      .insert(chatgptConnections)
      .values({ ownerId, tokenHash, ...connection })
      .onConflictDoUpdate({
        target: chatgptConnections.ownerId,
        set: { tokenHash, ...connection },
      });
  }

  async revoke(ownerId: string) {
    await this.database.delete(chatgptConnections).where(eq(chatgptConnections.ownerId, ownerId));
  }

  async authenticate(tokenHash: string, now: number) {
    const [row] = await this.database
      .select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        photoUrl: users.photoUrl,
      })
      .from(chatgptConnections)
      .innerJoin(users, eq(users.id, chatgptConnections.ownerId))
      .where(
        and(eq(chatgptConnections.tokenHash, tokenHash), gt(chatgptConnections.expiresAt, now)),
      )
      .limit(1);
    return row ?? null;
  }
}
