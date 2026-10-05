/**
 * The deployment config layer: `config/deploy.yml`, Spring Boot `application.yml` style.
 *
 * ONE AUTHORING SURFACE, ONE EFFECTIVE VALUE.
 *
 * `config/deploy.yml` is where a human edits deployment settings — profiles, database
 * host/port/name/user, and later TLS, domain and backups. This module is the only thing
 * that reads it. It resolves the selected profile, validates it, and PROJECTS the result
 * into `process.env` *before* Prisma or Next.js reads anything:
 *
 *     config/deploy.yml  ->  process.env.DATABASE_URL  ->  { Prisma CLI, the app }
 *
 * So the file is Spring-style to *edit*, but at runtime there is still exactly one
 * effective `DATABASE_URL`, and both consumers resolve it through this module. That
 * matters because `prisma.config.ts` deliberately refuses to carry its own
 * `DATABASE_URL` fallback — a second, silently-diverging source of truth for which
 * database is live is precisely the hazard this design has to avoid.
 *
 * Precedence, highest first:
 *   1. `DEPLOY_PROFILE` in the environment      (pick a profile for one run)
 *   2. `profile:` in config/deploy.yml          (the committed-for-you default)
 *   3. `NODE_ENV` -> development|test|production -> dev|test|prod
 *
 * Secrets are interpolated, never inlined: `password: ${WISESPLIT_DB_PASSWORD}` reads
 * the value from the environment (`.env`, or the real environment on a server), so the
 * config file can be shared without credentials in it.
 *
 * Server-only. Uses `node:fs`, so never import this from a client component.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/** The hand-edited file, relative to the project root. Gitignored; the template is committed. */
export const DEPLOY_CONFIG_FILE = "config/deploy.yml";

/** Where the committed template lives, quoted in error messages so the fix is one copy away. */
export const DEPLOY_CONFIG_TEMPLATE = "config/deploy.example.yml";

/** Used only when neither `profile:` nor `DEPLOY_PROFILE` picks one. */
const PROFILE_BY_NODE_ENV: Record<string, string> = {
  development: "dev",
  test: "test",
  production: "prod",
};

/**
 * Raised for anything a human can fix by editing the config file. The message always
 * starts with the file path (`config/deploy.yml: database.host is required`), so it
 * reads as an instruction rather than as a stack trace about a Prisma connection.
 */
export class DeployConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployConfigError";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const hostField = z.string({ error: "is required" }).min(1, "is required");
const nameField = z.string({ error: "is required" }).min(1, "is required");
const userField = z.string({ error: "is required" }).min(1, "is required");
const passwordField = z.string({ error: "is required" }).min(1, "is required");
const portField = z
  .coerce.number({ error: "must be a number" })
  .int("must be a whole number")
  .min(1, "must be between 1 and 65535")
  .max(65535, "must be between 1 and 65535");
const charsetField = z.string({ error: "must be text" }).default("utf8mb4");
const collationField = z.string({ error: "must be text" }).default("utf8mb4_bin");

/** What a profile must resolve to once `defaults` and the profile are merged. */
const databaseSchema = z.strictObject({
  host: hostField,
  port: portField,
  name: nameField,
  user: userField,
  password: passwordField,
  charset: charsetField,
  collation: collationField,
});

/**
 * What one block may *say* before merging.
 *
 * Deliberately untyped per setting: this pass runs BEFORE `${VAR}` interpolation, so
 * any value may still be a placeholder — `port: ${WISESPLIT_DB_PORT:-3306}` is a string
 * until it is resolved. Each setting gets its real type check after interpolation, in
 * `databaseSchema` below, which is strict and therefore still catches a typo
 * (`config/deploy.yml: unknown setting "prot" in database`).
 */
const databaseBlockSchema = z.record(z.string(), z.unknown(), {
  error: "must be a mapping of settings",
});

const profileSchema = z.strictObject(
  { database: databaseBlockSchema.optional() },
  { error: "must be a mapping of settings" }
);

const rootSchema = z.strictObject({
  profile: z.string({ error: "must be text" }).min(1, "is required").optional(),
  defaults: profileSchema.optional(),
  profiles: z.record(z.string(), profileSchema, { error: "must be a mapping of profiles" }),
  // Recognised-but-not-yet-consumed sections. They are accepted so a future setting can
  // be staged in the file without editing this loader, and nothing reads them. Add the
  // schema here first, then the code that consumes it — do not read raw values out of
  // them from elsewhere.
  tls: z.unknown().optional(),
  domain: z.unknown().optional(),
  backup: z.unknown().optional(),
});

/**
 * `config/deploy.yml: database.host is required`
 *
 * One line per problem, each naming the setting the way it is written in the file, so
 * the reader can go straight to it.
 */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const at = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      if (issue.code === "unrecognized_keys") {
        const keys = issue.keys;
        const list = keys.map((k) => `"${k}"`).join(", ");
        const where = issue.path.length > 0 ? ` in ${at}` : "";
        return `${DEPLOY_CONFIG_FILE}: unknown setting${keys.length === 1 ? "" : "s"} ${list}${where}`;
      }
      return `${DEPLOY_CONFIG_FILE}: ${at} ${issue.message}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// `${VAR}` interpolation
// ---------------------------------------------------------------------------

const INTERPOLATION = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/**
 * Resolve `${VAR}` and `${VAR:-default}` in one string.
 *
 * `at` is the path the value sits at, so an unset variable reports the setting that
 * needs it rather than just the variable name.
 */
function interpolateString(value: string, env: NodeJS.ProcessEnv, at: string[]): string {
  return value.replace(INTERPOLATION, (match, variable: string, fallback: string | undefined) => {
    const fromEnvironment = env[variable];
    if (fromEnvironment !== undefined) return fromEnvironment;
    if (fallback !== undefined) return fallback;
    throw new DeployConfigError(
      `${DEPLOY_CONFIG_FILE}: ${at.join(".") || "(root)"} references ${match}, which is not set\n` +
        `  Define ${variable} in .env (or in the real environment), or write a default in the file as ` +
        `\${${variable}:-fallback}.`
    );
  });
}

/** Interpolate every string in the merged block, depth-first. */
function interpolateTree(node: unknown, env: NodeJS.ProcessEnv, at: string[]): unknown {
  if (typeof node === "string") return interpolateString(node, env, at);
  if (Array.isArray(node)) return node.map((item, i) => interpolateTree(item, env, [...at, String(i)]));
  if (isPlainObject(node)) {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, interpolateTree(value, env, [...at, key])])
    );
  }
  return node;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Overlay `override` onto `base`, one level of nesting deep — enough for these blocks. */
function mergeDatabase(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined
): Record<string, unknown> {
  return { ...(base ?? {}), ...(override ?? {}) };
}

export type DeployDatabase = z.infer<typeof databaseSchema>;

export type DeployConfig = {
  /** Absolute path of the file this came from. */
  file: string;
  /** The profile that was selected, e.g. `dev`. */
  profile: string;
  database: DeployDatabase;
  /** The value projected into `process.env.DATABASE_URL`. */
  databaseUrl: string;
};

/**
 * Compose the connection string Prisma and the app both consume.
 *
 * Credentials are percent-encoded, so a password containing `@`, `:` or `/` still
 * produces a valid URL rather than a silently-different host.
 */
function buildDatabaseUrl(database: DeployDatabase): string {
  const user = encodeURIComponent(database.user);
  const password = encodeURIComponent(database.password);
  return `mysql://${user}:${password}@${database.host}:${database.port}/${database.name}`;
}

/** Which profile is live: `DEPLOY_PROFILE`, else `profile:`, else derived from NODE_ENV. */
function resolveProfileName(root: Record<string, unknown>, env: NodeJS.ProcessEnv): string {
  const fromEnvironment = env.DEPLOY_PROFILE?.trim();
  if (fromEnvironment) return fromEnvironment;
  if (typeof root.profile === "string" && root.profile.trim() !== "") return root.profile.trim();
  const derived = PROFILE_BY_NODE_ENV[env.NODE_ENV ?? ""];
  if (derived) return derived;
  throw new DeployConfigError(
    `${DEPLOY_CONFIG_FILE}: no profile selected — set \`profile: <name>\` in the file, or DEPLOY_PROFILE in the environment`
  );
}

/**
 * Read, resolve and validate `config/deploy.yml`.
 *
 * Returns `null` when the file is simply not there (a fresh clone, or a CI job that
 * only needs `prisma generate`), so the caller can decide how loud to be. It THROWS
 * `DeployConfigError` when the file exists and is wrong — including a missing
 * `DATABASE_URL`-critical setting — because booting against a config that cannot
 * describe the database produces exactly the cryptic connection failure this layer
 * exists to replace.
 */
export function loadDeployConfig(
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}
): DeployConfig | null {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const file = path.resolve(cwd, DEPLOY_CONFIG_FILE);

  if (!existsSync(file)) return null;

  const text = readFileSync(file, "utf8");

  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new DeployConfigError(`${DEPLOY_CONFIG_FILE}: not valid YAML — ${detail}`);
  }

  if (parsed === null || parsed === undefined) {
    throw new DeployConfigError(
      `${DEPLOY_CONFIG_FILE}: is empty — it needs a \`profiles:\` block. See ${DEPLOY_CONFIG_TEMPLATE}.`
    );
  }
  if (!isPlainObject(parsed)) {
    throw new DeployConfigError(
      `${DEPLOY_CONFIG_FILE}: the top level must be a mapping of settings, not ${Array.isArray(parsed) ? "a list" : typeof parsed}`
    );
  }

  // Structure first, interpolation second: a section this loader does not consume yet
  // (`tls:`, `backup:`) must not fail the run just because a `${...}` in it is unset.
  const structural = rootSchema.safeParse(parsed);
  if (!structural.success) throw new DeployConfigError(formatIssues(structural.error));
  const root = structural.data;

  const profileName = resolveProfileName(parsed, env);
  const profile = root.profiles[profileName];
  if (!profile) {
    const available = Object.keys(root.profiles);
    throw new DeployConfigError(
      `${DEPLOY_CONFIG_FILE}: profile "${profileName}" is not defined\n` +
        `  available: ${available.length > 0 ? available.join(", ") : "(none — add a profiles: block)"}`
    );
  }

  const merged = interpolateTree(
    mergeDatabase(root.defaults?.database, profile.database),
    env,
    ["database"]
  );

  // Validated nested under its real name so the error reads `database.host`.
  const database = z
    .strictObject({ database: databaseSchema })
    .safeParse({ database: merged });
  if (!database.success) throw new DeployConfigError(formatIssues(database.error));

  return {
    file,
    profile: profileName,
    database: database.data.database,
    databaseUrl: buildDatabaseUrl(database.data.database),
  };
}

export type ApplyDeployConfigResult = {
  /** `null` when `config/deploy.yml` does not exist. */
  config: DeployConfig | null;
  /** Human-readable notes worth printing at boot. Never contains a password. */
  warnings: string[];
};

let applied: ApplyDeployConfigResult | undefined;

/**
 * Load the config and project it into `process.env.DATABASE_URL`.
 *
 * Call this at the top of every entry point — `next.config.ts`, `prisma.config.ts`,
 * `instrumentation.ts` — *before* anything constructs a Prisma client or reads
 * `DATABASE_URL`. Idempotent: the work happens once per process.
 *
 * Also loads `.env` (without overriding real environment variables), so a secret
 * referenced as `${VAR}` resolves the same way for the Prisma CLI as it does for the
 * app. That is the whole point: one projection step, two consumers.
 *
 * Never logs or returns the password.
 */
export function applyDeployConfig(
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}
): ApplyDeployConfigResult {
  if (applied && options.env === undefined && options.cwd === undefined) return applied;

  const cwd = options.cwd ?? process.cwd();
  loadDotEnv({ path: path.join(cwd, ".env"), quiet: true });

  const env = options.env ?? process.env;
  const warnings: string[] = [];
  const config = loadDeployConfig({ env, cwd });

  if (!config) {
    warnings.push(
      `${DEPLOY_CONFIG_FILE} not found — DATABASE_URL will come straight from the environment.\n` +
        `  Copy ${DEPLOY_CONFIG_TEMPLATE} to ${DEPLOY_CONFIG_FILE} and edit it: that file is the\n` +
        `  single source of truth for which database is live.`
    );
    const result = { config: null, warnings };
    if (options.env === undefined && options.cwd === undefined) applied = result;
    return result;
  }

  if (env.DATABASE_URL && env.DATABASE_URL !== config.databaseUrl) {
    warnings.push(
      `DATABASE_URL was set in the environment; ${DEPLOY_CONFIG_FILE} (profile "${config.profile}") takes precedence.\n` +
        `  To point somewhere else, select a profile instead — DEPLOY_PROFILE=<name> — and remove\n` +
        `  DATABASE_URL from .env: the profile is the setting that decides which database is live.`
    );
  }

  env.DATABASE_URL = config.databaseUrl;

  const result = { config, warnings };
  if (options.env === undefined && options.cwd === undefined) applied = result;
  return result;
}

/**
 * The config resolved for this process, or `throw`s with the readable message.
 * For callers that cannot continue without a database — nothing in this app does today,
 * since a missing file must still let `prisma generate` run.
 */
export function requireDeployConfig(options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): DeployConfig {
  const config = loadDeployConfig(options);
  if (!config) {
    throw new DeployConfigError(
      `${DEPLOY_CONFIG_FILE} not found — copy ${DEPLOY_CONFIG_TEMPLATE} to ${DEPLOY_CONFIG_FILE} and edit it.`
    );
  }
  return config;
}

/** `mysql://user@host:port/database — profile "dev"` — safe to print. */
export function describeDeployConfig(config: DeployConfig): string {
  const { user, host, port, name } = config.database;
  return `mysql://${user}@${host}:${port}/${name} — profile "${config.profile}"`;
}

/** Reset the per-process memo. Tests only. */
export function resetDeployConfigCache() {
  applied = undefined;
}
