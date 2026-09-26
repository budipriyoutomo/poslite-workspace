/** ISO weekdays as the API stores them: 1 = Monday … 7 = Sunday. */
export const DAYS = [
  { value: 1, label: "Sen" },
  { value: 2, label: "Sel" },
  { value: 3, label: "Rab" },
  { value: 4, label: "Kam" },
  { value: 5, label: "Jum" },
  { value: 6, label: "Sab" },
  { value: 7, label: "Min" },
];

/** Every day checked is stored as "no restriction" ([]), so new days never need migrating. */
export const toDaysOfWeek = (checked: number[]) => (checked.length === DAYS.length ? [] : [...checked].sort((a, b) => a - b));
export const fromDaysOfWeek = (days: number[]) => (days.length === 0 ? DAYS.map((d) => d.value) : days);
