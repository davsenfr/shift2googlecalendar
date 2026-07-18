import { PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, AuthStatus, DayState, ShiftType } from './api';
import { addDays, formatDateTitle, relativeDate, today } from './date';

const SHIFT_COPY: Record<ShiftType, { name: string; time: string; note: string }> = {
  morning_short: { name: 'Matin', time: '6h45 — 13h45', note: 'Court' },
  morning_long: { name: 'Matin', time: '6h45 — 14h45', note: 'Long' },
  all_day_rh: { name: 'RH', time: 'Toute la journée', note: 'Journée' },
  all_day_rc: { name: 'RC', time: 'Toute la journée', note: 'Journée' },
  all_day_rf: { name: 'RF', time: 'Toute la journée', note: 'Journée' },
  afternoon: { name: 'Après midi', time: '13h30 — 21h30', note: '' },
};

type DragStart = { x: number; y: number; pointerId: number } | null;

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<DayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ShiftType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragStart = useRef<DragStart>(null);

  useEffect(() => {
    api.authStatus()
      .then(setAuth)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const refresh = useCallback(async (quiet = false, signal?: AbortSignal) => {
    if (!auth?.connected) return;
    if (!quiet) setLoading(true);
    try {
      const state = await api.day(date, signal);
      setDay(state);
      setError(null);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [auth?.connected, date]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(false, controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!auth?.connected) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !saving) void refresh(true);
    }, 15_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [auth?.connected, refresh, saving]);

  const choose = async (shift: ShiftType) => {
    if (saving || loading || day?.selection === shift) return;
    setSaving(shift);
    setError(null);
    try {
      await api.select(date, shift);
      setDay(null);
      setDate((current) => addDays(current, 1));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const move = (amount: number) => {
    if (saving) return;
    setDay(null);
    setDate((current) => addDays(current, amount));
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    dragStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const xDistance = event.clientX - start.x;
    const yDistance = event.clientY - start.y;
    if (Math.abs(xDistance) >= 55 && Math.abs(xDistance) > Math.abs(yDistance) * 1.25) {
      move(xDistance < 0 ? 1 : -1);
    }
  };

  if (!auth) {
    return <CenteredState message={error ?? 'Ouverture de votre agenda…'} />;
  }

  if (!auth.configured) {
    return (
      <CenteredState
        eyebrow="Configuration requise"
        message="Ajoutez les identifiants Google OAuth dans le fichier .env du serveur."
      />
    );
  }

  if (!auth.connected) {
    return (
      <main className="welcome">
        <div className="welcome-mark" aria-hidden="true">M</div>
        <p className="eyebrow">Mes horaires</p>
        <h1>Un geste.<br />Votre agenda est à jour.</h1>
        <p className="welcome-copy">
          Connectez l’agenda Google dans lequel vous souhaitez enregistrer vos horaires.
        </p>
        <a className="connect-button" href={`${API_BASE}/auth/google`}>Connecter Google Calendar</a>
        <p className="privacy-note">L’accès à Google reste côté serveur.</p>
      </main>
    );
  }

  const relative = relativeDate(date);
  return (
    <main
      className="schedule"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (dragStart.current = null)}
    >
      <header className="title-bar">
        <button className="arrow" onClick={() => move(-1)} aria-label="Jour précédent">‹</button>
        <div className="date-heading" aria-live="polite">
          <span>{relative ?? 'Date choisie'}</span>
          <h1>{formatDateTitle(date)}</h1>
        </div>
        <button className="arrow" onClick={() => move(1)} aria-label="Jour suivant">›</button>
        <span className={`sync-dot ${loading ? 'syncing' : ''}`} aria-label={loading ? 'Synchronisation en cours' : 'Synchronisé'} />
      </header>

      <section className={`shift-grid ${loading && !day ? 'is-loading' : ''}`} aria-busy={loading || Boolean(saving)}>
        <div className="morning-row">
          <ShiftButton type="morning_short" active={day?.selection === 'morning_short'} saving={saving === 'morning_short'} onChoose={choose} />
          <ShiftButton type="morning_long" active={day?.selection === 'morning_long'} saving={saving === 'morning_long'} onChoose={choose} />
        </div>
        <div className="day-off-row" aria-label="Événements de journée entière">
          <ShiftButton type="all_day_rh" active={day?.selection === 'all_day_rh'} saving={saving === 'all_day_rh'} onChoose={choose} compact />
          <ShiftButton type="all_day_rc" active={day?.selection === 'all_day_rc'} saving={saving === 'all_day_rc'} onChoose={choose} compact />
          <ShiftButton type="all_day_rf" active={day?.selection === 'all_day_rf'} saving={saving === 'all_day_rf'} onChoose={choose} compact />
        </div>
        <ShiftButton type="afternoon" active={day?.selection === 'afternoon'} saving={saving === 'afternoon'} onChoose={choose} />
      </section>

      {day?.event?.modifiedInGoogle && (
        <aside className="notice" role="status">
          Horaire modifié dans Google : {formatEventTime(day.event.startsAt)} — {formatEventTime(day.event.endsAt)}
        </aside>
      )}
      {day && day.duplicateCount > 0 && (
        <aside className="notice warning" role="status">Plusieurs horaires correspondants existent ce jour-là.</aside>
      )}
      {error && <aside className="notice error" role="alert">{error}</aside>}
      <p className="swipe-hint" aria-hidden="true">Glissez pour changer de jour</p>
    </main>
  );
}

function ShiftButton({
  type,
  active,
  saving,
  onChoose,
  compact = false,
}: {
  type: ShiftType;
  active: boolean;
  saving: boolean;
  onChoose: (type: ShiftType) => void;
  compact?: boolean;
}) {
  const copy = SHIFT_COPY[type];
  return (
    <button
      type="button"
      className={`shift-card ${type} ${compact ? 'compact' : ''} ${active ? 'active' : ''}`}
      aria-pressed={active}
      onClick={() => onChoose(type)}
    >
      <span className="shift-note">{copy.note || 'Service'}</span>
      <strong>{copy.name}</strong>
      <span className="shift-time">{copy.time}</span>
      <span className="selection-state">{saving ? 'Enregistrement…' : active ? '✓ Sélectionné' : 'Choisir'}</span>
    </button>
  );
}

function CenteredState({ message, eyebrow }: { message: string; eyebrow?: string }) {
  return (
    <main className="centered-state">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <p>{message}</p>
    </main>
  );
}

function formatEventTime(value: string | null): string {
  if (!value) return '?';
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
