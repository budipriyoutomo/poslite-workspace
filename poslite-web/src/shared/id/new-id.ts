import { monotonicFactory } from "ulidx";

const ulid = monotonicFactory();

/** Client-generated ULID for every entity and event (ADR-003) — never auto-increment. */
export function newId(): string {
  return ulid();
}
