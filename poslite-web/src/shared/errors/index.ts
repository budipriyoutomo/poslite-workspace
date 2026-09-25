/** Expected business failure with a stable code the UI can map to a message (copy.ts). */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = "AppError";
  }
}
