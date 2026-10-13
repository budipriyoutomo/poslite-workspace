const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

/** "12 Okt 2026" — accepts ISO dates ("2026-10-12") and timestamps. */
export const formatDate = (value: string): string => date.format(new Date(value));

/** "12 Okt 2026, 09.30" in the browser's time zone. */
export const formatDateTime = (value: string): string => dateTime.format(new Date(value));
