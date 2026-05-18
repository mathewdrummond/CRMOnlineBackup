export type DatabaseDriver = "sqlite" | "postgres";

export function readDatabaseDriver(): DatabaseDriver {
  const value = String(process.env.DATABASE_DRIVER || "sqlite").trim().toLowerCase();
  if (value === "sqlite" || value === "postgres") {
    return value;
  }
  throw new Error(`Unsupported DATABASE_DRIVER value "${value}". Expected "sqlite" or "postgres".`);
}

export function isPostgresPrimary() {
  return readDatabaseDriver() === "postgres";
}

export function isPostgresShadowWriteEnabled() {
  const value = String(process.env.DATABASE_SHADOW_WRITE || "").trim().toLowerCase();
  if (!value) {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value);
}

export function isPostgresEnabledForRuntime() {
  return isPostgresPrimary() || isPostgresShadowWriteEnabled();
}
