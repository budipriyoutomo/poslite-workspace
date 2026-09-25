/** Expected business failure with a stable code the UI can map to a message (copy.ts). */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}
