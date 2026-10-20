import { and, eq, users, type Database } from "@vinventory/db";

import type { CurrentUser, DevAuthRepository } from "./types.js";

export class DrizzleDevAuthRepository implements DevAuthRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async findDevUser(email: string): Promise<CurrentUser | null> {
    const [user] = await this.#db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        accountType: users.accountType,
      })
      .from(users)
      .where(
        and(
          eq(users.authProvider, "dev"),
          eq(users.email, email),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    return user ?? null;
  }
}
