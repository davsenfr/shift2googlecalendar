const isoFormatter = new Intl.DateTimeFormat('fr-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const titleFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function localNoon(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

export function today(): string {
  return isoFormatter.format(new Date());
}

export function firstDayOfCurrentYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function addDays(date: string, amount: number): string {
  const next = localNoon(date);
  next.setDate(next.getDate() + amount);
  return isoFormatter.format(next);
}

export function formatDateTitle(date: string): string {
  return titleFormatter.format(localNoon(date));
}

export function formatShortDate(date: string): string {
  return shortDateFormatter.format(localNoon(date));
}

export function relativeDate(date: string): string | null {
  const current = today();
  if (date === current) return "Aujourd’hui";
  if (date === addDays(current, 1)) return 'Demain';
  if (date === addDays(current, -1)) return 'Hier';
  return null;
}
