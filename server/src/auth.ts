import crypto from "node:crypto";
import type { Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { createEntityRecord, getEntityRecord, listEntityRecords, updateEntityRecord } from "./db";
import { EntityRecord, LocalUser, MutationContext } from "./types";

const DEFAULT_SESSION_DURATION_HOURS = 12;
const MAX_SESSION_DURATION_HOURS = 24 * 14;
const SECURE_SESSION_COOKIE_NAME = "__Host-crm_session";
const INSECURE_SESSION_COOKIE_NAME = "crm_session";

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

type GoogleProfile = {
  googleSubject: string;
  email: string;
  fullName: string;
  givenName: string;
  familyName: string;
  avatarUrl: string;
};

type GoogleProfileVerifier = (credential: string) => Promise<GoogleProfile>;

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let googleProfileVerifierOverride: GoogleProfileVerifier | null = null;

export function setGoogleProfileVerifierForTests(verifier: GoogleProfileVerifier | null) {
  if (String(process.env.NODE_ENV || "").toLowerCase() !== "test") {
    throw new Error("Google profile verifier overrides are only available in test mode.");
  }

  googleProfileVerifierOverride = verifier;
}

export function getAuthConfig() {
  const googleClientId = getGoogleClientId();
  const bootstrapAdminEmails = getBootstrapAdminEmails();
  const hasInvitedUsers = listEntityRecords("AppUser").length > 0;
  const sessionSecretConfigured = hasConfiguredSessionSecret();
  const issues = [];

  if (!googleClientId) {
    issues.push("missing_google_client_id");
  }

  if (!sessionSecretConfigured) {
    issues.push("missing_session_secret");
  }

  if (!hasInvitedUsers && bootstrapAdminEmails.size === 0) {
    issues.push("missing_bootstrap_admins");
  }

  return {
    googleClientId,
    googleEnabled: Boolean(googleClientId),
    sessionSecretConfigured,
    bootstrapAdminsConfigured: bootstrapAdminEmails.size > 0,
    bootstrapAdminCount: bootstrapAdminEmails.size,
    hasInvitedUsers,
    signInEnabled: Boolean(googleClientId) && sessionSecretConfigured && (hasInvitedUsers || bootstrapAdminEmails.size > 0),
    issues,
  };
}

export async function authenticateWithGoogleCredential(credential: string) {
  if (!getGoogleClient() || !getGoogleClientId()) {
    throw new AuthError(503, "google_not_configured", "Google sign-in has not been configured on the server.");
  }

  const profile = await verifyGoogleCredential(credential);
  const existingUser = findAppUserByEmail(profile.email);

  if (!existingUser && isBootstrapAdminEmail(profile.email)) {
    const created = createEntityRecord("AppUser", {
      email: profile.email,
      full_name: profile.fullName || profile.email,
      first_name: profile.givenName,
      last_name: profile.familyName,
      role: "admin",
      status: "active",
      google_sub: profile.googleSubject,
      avatar_url: profile.avatarUrl,
      invited_by_email: "bootstrap",
      invited_date: new Date().toISOString(),
      last_login_date: new Date().toISOString(),
    });

    return buildLoginResponse(created);
  }

  if (!existingUser) {
    throw new AuthError(403, "not_invited", "This Google account has not been invited to the CRM.");
  }

  const userStatus = String(existingUser.status || "invited").toLowerCase();
  if (userStatus === "revoked" || userStatus === "disabled") {
    throw new AuthError(403, "access_revoked", "This Google account no longer has access to the CRM.");
  }

  const updatedUser = updateEntityRecord("AppUser", existingUser.id, {
    email: profile.email,
    full_name: profile.fullName || existingUser.full_name || profile.email,
    first_name: profile.givenName,
    last_name: profile.familyName,
    role: existingUser.role || "member",
    status: "active",
    google_sub: profile.googleSubject,
    avatar_url: profile.avatarUrl,
    last_login_date: new Date().toISOString(),
    row_version: existingUser.row_version,
  }, {
    actor: mapAppUserToLocalUser(existingUser),
    request_source: "google-auth",
    expected_row_version: existingUser.row_version,
  });

  if (!updatedUser) {
    throw new AuthError(500, "user_update_failed", "Failed to update access record.");
  }

  return buildLoginResponse(updatedUser);
}

export function requireAuthenticatedUserFromToken(
  rawAuthorizationHeader: string | undefined | null,
  rawCookieHeader?: string | null
): LocalUser {
  const token = readSessionToken(rawAuthorizationHeader, rawCookieHeader);
  if (!token) {
    throw new AuthError(401, "auth_required", "Sign in is required.");
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    throw new AuthError(401, "invalid_session", "Your session has expired. Please sign in again.");
  }

  const record = getEntityRecord("AppUser", payload.sub);
  if (!record) {
    throw new AuthError(401, "user_not_found", "Your access record could not be found.");
  }

  const status = String(record.status || "invited").toLowerCase();
  if (status === "revoked" || status === "disabled") {
    throw new AuthError(403, "access_revoked", "This Google account no longer has access to the CRM.");
  }

  const revokedBefore = Date.parse(String(record.session_revoked_before || ""));
  if (Number.isFinite(revokedBefore) && revokedBefore >= payload.iat) {
    throw new AuthError(401, "invalid_session", "Your session has expired. Please sign in again.");
  }

  return mapAppUserToLocalUser(record);
}

export function requireAdminUserFromToken(
  rawAuthorizationHeader: string | undefined | null,
  rawCookieHeader?: string | null
): LocalUser {
  const user = requireAuthenticatedUserFromToken(rawAuthorizationHeader, rawCookieHeader);
  if (String(user.role || "").toLowerCase() !== "admin") {
    throw new AuthError(403, "admin_required", "Admin access is required.");
  }

  return user;
}

export function listAccessUsers() {
  return listEntityRecords("AppUser", { sort: "email" });
}

export function createOrInviteAccessUser(input: Record<string, unknown>, invitedByEmail: string, context: MutationContext = {}) {
  const email = normaliseEmail(String(input.email || ""));
  if (!email) {
    throw new AuthError(400, "email_required", "An email address is required.");
  }

  const role = normaliseRole(String(input.role || "member"));
  const existingUser = findAppUserByEmail(email);

  if (existingUser) {
    const updated = updateEntityRecord("AppUser", existingUser.id, {
      email,
      role,
      status: String(input.status || existingUser.status || "invited").toLowerCase() === "active" ? "active" : "invited",
      invited_by_email: invitedByEmail,
      invited_date: existingUser.invited_date || new Date().toISOString(),
      full_name: String(input.full_name || existingUser.full_name || ""),
      row_version: existingUser.row_version,
    }, {
      ...context,
      expected_row_version: existingUser.row_version,
    });

    if (!updated) {
      throw new AuthError(500, "invite_update_failed", "Failed to update the invited user.");
    }

    return updated;
  }

  return createEntityRecord("AppUser", {
    email,
    full_name: String(input.full_name || ""),
    first_name: "",
    last_name: "",
    role,
    status: String(input.status || "invited").toLowerCase() === "active" ? "active" : "invited",
    invited_by_email: invitedByEmail,
    invited_date: new Date().toISOString(),
    last_login_date: "",
  }, context);
}

export function updateAccessUser(userId: string, input: Record<string, unknown>, context: MutationContext = {}) {
  const existing = getEntityRecord("AppUser", userId);
  if (!existing) {
    throw new AuthError(404, "user_not_found", "Access record not found.");
  }

  const nextEmail = Object.prototype.hasOwnProperty.call(input, "email")
    ? normaliseEmail(String(input.email || ""))
    : String(existing.email || "");

  if (!nextEmail) {
    throw new AuthError(400, "email_required", "An email address is required.");
  }

  const conflictingUser = findAppUserByEmail(nextEmail);
  if (conflictingUser && conflictingUser.id !== userId) {
    throw new AuthError(409, "email_conflict", "That email address is already invited.");
  }

  const nextRole = Object.prototype.hasOwnProperty.call(input, "role")
    ? normaliseRole(String(input.role || "member"))
    : String(existing.role || "member");
  const nextStatus = Object.prototype.hasOwnProperty.call(input, "status")
    ? normaliseStatus(String(input.status || "invited"))
    : String(existing.status || "invited");

  const updated = updateEntityRecord("AppUser", userId, {
    email: nextEmail,
    full_name: Object.prototype.hasOwnProperty.call(input, "full_name")
      ? String(input.full_name || "")
      : existing.full_name || "",
    role: nextRole,
    status: nextStatus,
    row_version: existing.row_version,
  }, {
    ...context,
    expected_row_version: existing.row_version,
  });

  if (!updated) {
    throw new AuthError(500, "user_update_failed", "Failed to update the access record.");
  }

  return updated;
}

export function writeSessionCookie(res: Response, user: LocalUser, secure: boolean) {
  const token = createSessionToken(user);
  const cookieName = secure ? SECURE_SESSION_COOKIE_NAME : INSECURE_SESSION_COOKIE_NAME;

  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: getSessionDurationMs(),
  });

  clearSessionCookie(res, secure ? "insecure-only" : "secure-only");
}

export function invalidateUserSessions(userId: string, context: MutationContext = {}) {
  const existing = getEntityRecord("AppUser", userId);
  if (!existing) {
    return null;
  }

  return updateEntityRecord("AppUser", userId, {
    session_revoked_before: new Date().toISOString(),
    row_version: existing.row_version,
  }, {
    ...context,
    expected_row_version: existing.row_version,
  });
}

export function hasSessionCookie(rawCookieHeader: string | undefined | null) {
  return Boolean(
    readCookieValue(rawCookieHeader, SECURE_SESSION_COOKIE_NAME)
    || readCookieValue(rawCookieHeader, INSECURE_SESSION_COOKIE_NAME)
  );
}

export function clearSessionCookie(res: Response, mode: "all" | "secure-only" | "insecure-only" = "all") {
  if (mode === "all" || mode === "secure-only") {
    res.clearCookie(SECURE_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
    });
  }

  if (mode === "all" || mode === "insecure-only") {
    res.clearCookie(INSECURE_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
    });
  }
}

function buildLoginResponse(record: EntityRecord) {
  const user = mapAppUserToLocalUser(record);
  return {
    user,
  };
}

function mapAppUserToLocalUser(record: EntityRecord): LocalUser {
  return {
    id: String(record.id),
    full_name: String(record.full_name || record.email || "User"),
    role: String(record.role || "member"),
    email: String(record.email || ""),
    avatar_url: String(record.avatar_url || ""),
  };
}

async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
  if (googleProfileVerifierOverride) {
    return googleProfileVerifierOverride(credential);
  }

  const googleClientId = getGoogleClientId();
  const googleClient = getGoogleClient();

  if (!googleClient || !googleClientId) {
    throw new AuthError(503, "google_not_configured", "Google sign-in has not been configured on the server.");
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();

    const email = normaliseEmail(String(payload?.email || ""));
    const emailVerified = Boolean(payload?.email_verified);

    if (!email || !emailVerified) {
      throw new AuthError(403, "email_not_verified", "Google did not return a verified email address for this account.");
    }

    return {
      googleSubject: String(payload?.sub || ""),
      email,
      fullName: String(payload?.name || ""),
      givenName: String(payload?.given_name || ""),
      familyName: String(payload?.family_name || ""),
      avatarUrl: String(payload?.picture || ""),
    };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError(401, "invalid_google_token", "Google sign-in could not be verified.");
  }
}

function findAppUserByEmail(email: string) {
  const normalisedEmail = normaliseEmail(email);
  return listEntityRecords("AppUser").find(
    (record) => normaliseEmail(String(record.email || "")) === normalisedEmail
  ) || null;
}

function isBootstrapAdminEmail(email: string) {
  return getBootstrapAdminEmails().has(normaliseEmail(email));
}

function normaliseRole(role: string) {
  return String(role || "").toLowerCase() === "admin" ? "admin" : "member";
}

function normaliseStatus(status: string) {
  const nextStatus = String(status || "").toLowerCase();
  if (nextStatus === "active" || nextStatus === "revoked") {
    return nextStatus;
  }

  return "invited";
}

function normaliseEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function createSessionToken(user: LocalUser) {
  const issuedAt = Date.now();
  const payload: SessionPayload = {
    sub: user.id,
    iat: issuedAt,
    exp: issuedAt + getSessionDurationMs(),
  };

  const encodedPayload = encodeTokenPart(JSON.stringify(payload));
  const signature = signTokenPart(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signTokenPart(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeTokenPart(encodedPayload)) as SessionPayload;
    if (!payload?.sub || !payload?.iat || !payload?.exp || payload.exp <= Date.now() || payload.iat > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function signTokenPart(value: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function encodeTokenPart(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeTokenPart(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function readBearerToken(rawAuthorizationHeader: string | undefined | null) {
  const headerValue = String(rawAuthorizationHeader || "");
  if (!headerValue.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return headerValue.slice("bearer ".length).trim();
}

function readCookieValue(rawCookieHeader: string | undefined | null, name: string) {
  const headerValue = String(rawCookieHeader || "");
  if (!headerValue) {
    return "";
  }

  for (const fragment of headerValue.split(";")) {
    const [key, ...valueParts] = fragment.trim().split("=");
    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return "";
}

function readSessionToken(
  rawAuthorizationHeader: string | undefined | null,
  rawCookieHeader: string | undefined | null
) {
  const cookieToken =
    readCookieValue(rawCookieHeader, SECURE_SESSION_COOKIE_NAME) ||
    readCookieValue(rawCookieHeader, INSECURE_SESSION_COOKIE_NAME);

  if (cookieToken) {
    return cookieToken;
  }

  return readBearerToken(rawAuthorizationHeader);
}

function getGoogleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

let cachedGoogleClientId = "";
let cachedGoogleClient: OAuth2Client | null = null;

function getGoogleClient() {
  const googleClientId = getGoogleClientId();
  if (!googleClientId) {
    cachedGoogleClientId = "";
    cachedGoogleClient = null;
    return null;
  }

  if (!cachedGoogleClient || cachedGoogleClientId !== googleClientId) {
    cachedGoogleClient = new OAuth2Client(googleClientId);
    cachedGoogleClientId = googleClientId;
  }

  return cachedGoogleClient;
}

function getSessionSecret() {
  const configuredSecret = String(process.env.AUTH_SESSION_SECRET || "").trim();

  if (configuredSecret) {
    if (String(process.env.NODE_ENV || "").toLowerCase() === "production" && configuredSecret.length < 32) {
      throw new AuthError(503, "session_secret_weak", "AUTH_SESSION_SECRET must be at least 32 characters in production.");
    }

    return configuredSecret;
  }

  if (String(process.env.NODE_ENV || "").toLowerCase() === "test") {
    return "joinerflow-test-session-secret";
  }

  throw new AuthError(503, "session_secret_missing", "AUTH_SESSION_SECRET must be configured on the server.");
}

function hasConfiguredSessionSecret() {
  const configuredSecret = String(process.env.AUTH_SESSION_SECRET || "").trim();
  if (configuredSecret) {
    return true;
  }

  return String(process.env.NODE_ENV || "").toLowerCase() === "test";
}

function getSessionDurationMs() {
  const rawHours = Number(process.env.AUTH_SESSION_TTL_HOURS || DEFAULT_SESSION_DURATION_HOURS);
  const boundedHours = Number.isFinite(rawHours) && rawHours > 0
    ? Math.min(rawHours, MAX_SESSION_DURATION_HOURS)
    : DEFAULT_SESSION_DURATION_HOURS;

  return Math.round(boundedHours * 60 * 60 * 1000);
}

function getBootstrapAdminEmails() {
  return new Set(
    String(process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS || "")
      .split(",")
      .map((value) => normaliseEmail(value))
      .filter(Boolean)
  );
}
