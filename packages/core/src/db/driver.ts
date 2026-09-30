/** What SQLite hands back and accepts: TimeBlock stores no blobs, and booleans are 0/1. */
export type SqlValue = null | number | string;
export type SqlRow = Record<string, SqlValue>;

/**
 * The few synchronous calls core needs from a SQLite connection. The desktop
 * wraps node:sqlite and the phone expo-sqlite; both are synchronous, which
 * keeps migrations and sync merges plain, ordered code.
 */
export interface SqlDriver {
  /** Runs one statement and returns its rows as objects keyed by column name. */
  all<T extends SqlRow = SqlRow>(sql: string, params?: SqlValue[]): T[];
  run(sql: string, params?: SqlValue[]): void;
  /** Runs a script of one or more statements, without parameters. */
  exec(sql: string): void;
}

/** Runs `fn` inside one write transaction, rolled back if it throws. */
export function transaction<T>(db: SqlDriver, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
