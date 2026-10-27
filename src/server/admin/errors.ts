/** A failure worth showing to the admin as is (validation, conflicts). */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Postgres error code of a failed query; drizzle wraps the driver error in `cause`. */
export function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.code ?? candidate?.cause?.code;
}

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";
