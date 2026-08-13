/**
 * Format a Date for `<input type="datetime-local">` using local calendar fields.
 * Avoids `toISOString().slice(0, 16)`, which feeds UTC into a local control.
 */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
