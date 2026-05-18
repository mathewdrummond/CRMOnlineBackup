import { beforeEach, afterEach, describe, expect, test } from "vitest";
import { getAuthConfig } from "./auth";
import { createEntityRecord, resetDatabaseForTests } from "./db";

describe("auth configuration", () => {
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const originalBootstrapAdmins = process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS;
  const originalSessionSecret = process.env.AUTH_SESSION_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    await resetDatabaseForTests();
    process.env.NODE_ENV = "development";
    process.env.GOOGLE_CLIENT_ID = "";
    process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = "";
    process.env.AUTH_SESSION_SECRET = "";
  });

  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
    process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = originalBootstrapAdmins;
    process.env.AUTH_SESSION_SECRET = originalSessionSecret;
    process.env.NODE_ENV = originalNodeEnv;
  });

  test("reports missing auth requirements clearly before first-time setup", () => {
    const config = getAuthConfig();

    expect(config.googleEnabled).toBe(false);
    expect(config.sessionSecretConfigured).toBe(false);
    expect(config.bootstrapAdminsConfigured).toBe(false);
    expect(config.hasInvitedUsers).toBe(false);
    expect(config.signInEnabled).toBe(false);
    expect(config.issues).toEqual([
      "missing_google_client_id",
      "missing_session_secret",
      "missing_bootstrap_admins",
    ]);
  });

  test("enables first-time sign-in when google auth, session secret, and bootstrap admins are configured", () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
    process.env.AUTH_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = "owner@example.com, second@example.com";

    const config = getAuthConfig();

    expect(config.googleEnabled).toBe(true);
    expect(config.sessionSecretConfigured).toBe(true);
    expect(config.bootstrapAdminsConfigured).toBe(true);
    expect(config.bootstrapAdminCount).toBe(2);
    expect(config.signInEnabled).toBe(true);
    expect(config.issues).toEqual([]);
  });

  test("does not require bootstrap emails once invited users already exist", () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
    process.env.AUTH_SESSION_SECRET = "0123456789abcdef0123456789abcdef";

    createEntityRecord("AppUser", {
      email: "admin@example.com",
      full_name: "Admin User",
      role: "admin",
      status: "active",
    });

    const config = getAuthConfig();

    expect(config.hasInvitedUsers).toBe(true);
    expect(config.bootstrapAdminsConfigured).toBe(false);
    expect(config.signInEnabled).toBe(true);
    expect(config.issues).toEqual([]);
  });
});
