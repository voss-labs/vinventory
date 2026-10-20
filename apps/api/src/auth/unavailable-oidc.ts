import type { OidcClient } from "./types.js";

// Stands in for VAuth when dev auth is on and no client credentials are set.
// The /auth/login and callback handlers already catch provider errors and
// redirect to /?authError=provider_unavailable.
export class UnavailableOidcClient implements OidcClient {
  async createAuthorizationRequest(): Promise<never> {
    throw new Error("VAuth client credentials are not configured");
  }

  async exchangeCallback(): Promise<never> {
    throw new Error("VAuth client credentials are not configured");
  }
}
