import { AppError } from "@/shared/errors";

import { copy } from "../copy";

export function errorMessage(error: unknown): string {
  return error instanceof AppError ? (copy.errors[error.code] ?? error.code) : String(error);
}
