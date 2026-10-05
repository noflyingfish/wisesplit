import type { NextConfig } from "next";
import { applyDeployConfig } from "./lib/config/deploy";

/**
 * Project the deployment config into `process.env` before anything else runs.
 *
 * This has to happen at the top of the config file, because Next.js reads
 * `process.env` (and `.env*`) and Prisma reads `DATABASE_URL` while this process is
 * starting up. `config/deploy.yml` is the one file a human edits; this call is what
 * makes the value in it the single effective `DATABASE_URL` for the app and for the
 * Prisma CLI alike (the CLI does the same thing in `prisma.config.ts`).
 *
 * A malformed config throws here, with a message naming the file and the setting —
 * `config/deploy.yml: database.host is required` — so a bad edit stops `next dev` /
 * `next build` immediately instead of surfacing later as a connection error.
 */
const { config, warnings } = applyDeployConfig();

for (const warning of warnings) {
  console.warn(`[config] ${warning}`);
}
if (config) {
  // Never the password: host/port/database/user and the profile that selected them.
  console.log(
    `[config] profile "${config.profile}" -> ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name} (${config.database.charset}/${config.database.collation})`
  );
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
