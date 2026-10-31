// Turns any thrown value into a short, readable message (includes the
// Postgres error code when there is one). Never includes the connection string.
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code;
    return code ? `${err.message} (code ${code})` : err.message;
  }
  return String(err);
}
