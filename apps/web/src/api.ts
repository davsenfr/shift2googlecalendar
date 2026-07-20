export type ShiftType =
  | 'morning_short'
  | 'morning_long'
  | 'all_day_rh'
  | 'all_day_rc'
  | 'all_day_rf'
  | 'all_day_ca'
  | 'afternoon'
  | 'all_day_other'
  | 'all_day_bike';

export type AuthStatus = {
  configured: boolean;
  connected: boolean;
};

export type DayState = {
  date: string;
  selection: ShiftType | null;
  event: {
    id: string | null;
    title: string;
    startsAt: string | null;
    endsAt: string | null;
    htmlLink: string | null;
    managedByApp: boolean;
    modifiedInGoogle: boolean;
  } | null;
  duplicateCount: number;
  syncedAt: string;
};

const API_BASE =
    import.meta.env.PROD
        ? import.meta.env.VITE_API_BASE_URL || ''
        : (import.meta.env.VITE_API_BASE_URL || '/api');


async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
    throw new Error(message || 'Impossible de joindre Google Calendar.');
  }
  return response.json() as Promise<T>;
}

export const api = {
  authStatus: () => request<AuthStatus>('/auth/status'),
  day: (date: string, signal?: AbortSignal) =>
    request<DayState>(`/calendar/days/${date}`, { signal }),
  select: (date: string, shift: ShiftType, title?: string) =>
    request<DayState>(`/calendar/days/${date}/shift`, {
      method: 'PUT',
      body: JSON.stringify({ shift, title }),
    }),
};
