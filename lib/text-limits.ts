/**
 * Length limits for the user-typed strings that reach a `varchar(191)` column.
 *
 * WHY THIS EXISTS (`NF-B4C-1`)
 *
 * Every `VARCHAR` column `tables.sql` creates is `varchar(191)` — that is what Prisma
 * emits for a bare `String` on MySQL/MariaDB (191 is the largest index-safe length on
 * the old utf8mb3 charset, and Prisma has kept it). SQLite never enforced the length.
 * MariaDB does. So on the migration, the first 192-character group name produced
 *
 *     P2000: The provided value for the column is too long for the column's type.
 *            Column: name
 *
 * out of the *write*, which nothing caught: HTTP 500, no row created, and a submit
 * button left on "Creating..." with no banner and no navigation — indistinguishable
 * from a hang. Measured boundary on a settled database: 190 ok, 191 ok, 192 refused.
 *
 * Nothing in `app/` or `lib/` validated length anywhere, so the fix is to check BEFORE
 * the write, on the server, and return the app's normal `{ error }` shape. A `P2000`
 * must never reach a user.
 *
 * MEASURED LENGTH COUNTS CODE POINTS, NOT UTF-16 UNITS
 *
 * `String.prototype.length` counts UTF-16 code units, so one emoji outside the BMP
 * counts as 2. MySQL/MariaDB counts *characters* (code points) for a utf8mb4 column.
 * Using `.length` would therefore refuse names the database accepts, so the check
 * counts code points (spread) and matches the column exactly.
 *
 * This is the SERVER check and it is the one that must be correct on its own — a
 * client can always bypass it. There is deliberately no mirroring `maxLength`
 * attribute in the forms: constraining the input would make the over-length state
 * unreachable from the UI, and a test that cannot deliver a 192-character value
 * cannot tell a fixed server from an unfixed one.
 */

/** The length every `varchar(191)` column in `tables.sql` accepts. */
export const MAX_TEXT_LENGTH = 191;

/**
 * Why a value was refused, or `null` when it fits.
 *
 * `fieldLabel` is the name the user sees ("Group name", "Description", …) — the
 * message has to name the field and the limit, because the banner is the only place
 * a rejection is reported.
 *
 * The value is measured *trimmed*, because the trim is what gets written
 * (`groupName.trim()` — an untrimmed 200-character name with 10 trailing spaces is a
 * legal 190-character value).
 */
export function textLengthError(
  value: string | null | undefined,
  fieldLabel: string
): string | null {
  const trimmed = (value ?? "").trim();
  const length = [...trimmed].length;
  if (length <= MAX_TEXT_LENGTH) return null;
  return `${fieldLabel} is too long — ${length} characters, and the limit is ${MAX_TEXT_LENGTH}.`;
}
