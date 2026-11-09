export function validDate(value: string): boolean {
  if (!value) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number(value.slice(0, 4)) >= 1900 &&
      Number(value.slice(0, 4)) <= 9999 &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value))
    return false;
  return (
    validDate(value.slice(0, 10)) &&
    Number(value.slice(11, 13)) < 24 &&
    Number(value.slice(14, 16)) < 60 &&
    (!value.slice(16).startsWith(':') || Number(value.slice(17, 19)) < 60) &&
    Number.isFinite(Date.parse(value))
  );
}
export function calendarDate(date: Date, timeZone = 'Asia/Seoul') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function expiryDays(value: string, now: Date, timeZone: string) {
  if (!value) return null;
  const end = value.length === 10 ? value : calendarDate(new Date(value), timeZone);
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${calendarDate(now, timeZone)}T00:00:00Z`)) /
      86400000,
  );
}
