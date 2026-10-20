export const labPermissions = [
  "manage_stock",
  "manage_policies",
  "approve_requests",
  "issue",
  "receive",
  "export",
] as const;

export type LabPermission = (typeof labPermissions)[number];

export type VerifiedIdentity = {
  provider: "vauth";
  subject: string;
  displayName: string;
  email: string;
};

export type CurrentUser = {
  id: string;
  displayName: string;
  email: string | null;
  accountType: "student" | "staff" | "system_admin";
};

export type OidcTransaction = {
  codeVerifier: string;
  state: string;
  nonce: string;
  returnTo: string;
  createdAt: number;
};

export interface OidcClient {
  createAuthorizationRequest(returnTo: string): Promise<{
    authorizationUrl: string;
    transaction: OidcTransaction;
  }>;
  exchangeCallback(
    callbackUrl: URL,
    transaction: OidcTransaction,
  ): Promise<VerifiedIdentity>;
}

export interface AuthRepository {
  upsertIdentity(identity: VerifiedIdentity): Promise<CurrentUser>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ipHash: string | null;
  }): Promise<void>;
  findActiveSession(tokenHash: string, now: Date): Promise<CurrentUser | null>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
  hasLabPermission(
    userId: string,
    labId: string,
    permission: LabPermission,
  ): Promise<boolean>;
}

export interface DevAuthRepository {
  /** Active seeded user with auth_provider 'dev' and this email, or null. */
  findDevUser(email: string): Promise<CurrentUser | null>;
}
