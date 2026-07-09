import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPasswordHash } from "./password";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthenticatedUser | undefined> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return undefined;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user || user.status !== "active") {
    return undefined;
  }

  const passwordMatches = await verifyPasswordHash(user.passwordHash, password);
  if (!passwordMatches) {
    return undefined;
  }

  return { id: user.id, email: user.email };
}
