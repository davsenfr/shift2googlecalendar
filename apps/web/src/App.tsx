import { FormEvent, PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, API_BASE, AuthStatus, DayState, ShiftStatus, ShiftType } from './api';
import { addDays, formatDateTitle, relativeDate, today } from './date';

const SHIFT_COPY: Record<ShiftType, { name: string; time: string; note: string }> = {
  morning_short: { name: 'Matin', time: '6h45 — 13h45', note: '' },
  morning_long: { name: 'Matin', time: '6h45 — 14h45', note: '' },
  all_day_rh: { name: 'RH', time: '', note: '' },
  all_day_rc: { name: 'RC', time: '', note: '' },
  all_day_rf: { name: 'RF', time: '', note: '' },
  all_day_ca: { name: 'CA', time: '', note: '' },
  afternoon: { name: 'Après midi', time: '13h30 — 21h30', note: '' },
  all_day_other: { name: 'Autres', time: '', note: '' },
  all_day_bike: { name: '🚲 Vélo', time: '', note: 'Kilométrage' },
};

type DragStart = { x: number; y: number; pointerId: number } | null;
type PageTransition = 'idle' | 'leaving' | 'entering';
type PageDirection = 'forward' | 'backward';

const PAGE_EXIT_DURATION_MS = 220;
const PAGE_ENTER_DURATION_MS = 320;

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<DayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ShiftType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingOther, setEditingOther] = useState(false);
  const [otherTitle, setOtherTitle] = useState('Autres');
  const [otherStatus, setOtherStatus] = useState<ShiftStatus>('provisional');
  const [editingBike, setEditingBike] = useState(false);
  const [bikeKilometers, setBikeKilometers] = useState('');
  const [pageTransition, setPageTransition] = useState<PageTransition>('idle');
  const [pageDirection, setPageDirection] = useState<PageDirection>('forward');
  const dragStart = useRef<DragStart>(null);
  const transitionLock = useRef(false);

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

  const transitionToDay = async (amount: number) => {
    if (transitionLock.current) return;
    transitionLock.current = true;
    setPageDirection(amount > 0 ? 'forward' : 'backward');
    try {
      setPageTransition('leaving');
      await waitForPageTransition(PAGE_EXIT_DURATION_MS);
      setDay(null);
      setDate((current) => addDays(current, amount));
      setPageTransition('entering');
      await waitForPageTransition(PAGE_ENTER_DURATION_MS);
    } finally {
      setPageTransition('idle');
      transitionLock.current = false;
    }
  };

  const choose = async (shift: ShiftType, status: ShiftStatus = 'provisional') => {
    if (saving || loading || transitionLock.current) return;
    if (day?.selection === shift && shift !== 'all_day_bike') {
      if (day.status !== status) {
        await changeShiftStatus(status);
        return;
      }
      if (shift !== 'all_day_other') {
        await saveCurrentShiftStatus(status);
        return;
      }
    }
    if (shift === 'all_day_other') {
      setOtherTitle(day?.selection === shift ? stripProvisionalTitlePrefix(day.event?.title) || 'Autres' : 'Autres');
      setOtherStatus(day?.selection === shift ? day.status ?? 'confirmed' : status);
      setError(null);
      setEditingOther(true);
      return;
    }
    if (shift === 'all_day_bike') {
      setBikeKilometers(extractBikeDistance(day?.bikeEvent?.title));
      setError(null);
      setEditingBike(true);
      return;
    }
    if (day?.selection === shift) return;
    setSaving(shift);
    setError(null);
    try {
      await api.select(date, shift, undefined, status);
      await transitionToDay(1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const saveOther = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = otherTitle.trim();
    if (!title || saving) return;
    const isEditing = day?.selection === 'all_day_other';
    setSaving('all_day_other');
    setError(null);
    try {
      const state = await api.select(date, 'all_day_other', title, otherStatus);
      setEditingOther(false);
      if (isEditing) {
        setDay(state);
      } else {
        await transitionToDay(1);
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const saveBike = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const distance = Number(bikeKilometers.replace(',', '.'));
    if (!Number.isFinite(distance) || distance <= 0 || saving) {
      setError('Saisissez une distance supérieure à 0 km.');
      return;
    }
    const isEditing = Boolean(day?.bikeEvent);
    const title = `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(distance)} km`;
    setSaving('all_day_bike');
    setError(null);
    try {
      const state = await api.select(date, 'all_day_bike', title);
      setEditingBike(false);
      if (isEditing) {
        setDay(state);
      } else {
        await transitionToDay(1);
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const move = (amount: number) => {
    if (saving || transitionLock.current) return;
    setDay(null);
    setDate((current) => addDays(current, amount));
  };

  const moveWithTransition = (amount: number) => {
    if (saving) return;
    void transitionToDay(amount);
  };

  const changeShiftStatus = async (status: ShiftStatus) => {
    if (status === day?.status || saving || loading || transitionLock.current) return;
    await saveCurrentShiftStatus(status);
  };

  const saveCurrentShiftStatus = async (status: ShiftStatus) => {
    if (saving || loading || transitionLock.current) return;
    if (!day?.selection || day.selection === 'all_day_bike') return;

    setSaving(day.selection);
    setError(null);
    try {
      const title = day.selection === 'all_day_other' ? day.event?.title : undefined;
      const state = await api.select(
        date,
        day.selection,
        title,
        status,
        day.event?.id ?? undefined,
      );
      if (
        state.selection !== day.selection ||
        state.status !== status ||
        !state.event?.managedByApp
      ) {
        setDay(state);
        throw new Error(
          'Google Calendar n’a pas confirmé la modification de cet horaire.',
        );
      }
      await transitionToDay(1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(null);
    }
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
  const activeHeadingShift = day?.selection;
  const activeHeadingTitle = activeHeadingShift
    ? activeHeadingShift === 'all_day_other'
      ? stripProvisionalTitlePrefix(day?.event?.title) || SHIFT_COPY[activeHeadingShift].name
      : SHIFT_COPY[activeHeadingShift].name
    : null;
  return (
    <main
      className={`schedule page-${pageTransition} page-${pageDirection}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (dragStart.current = null)}
    >
      <header className="title-bar">
        <button className="arrow" onClick={() => moveWithTransition(-1)} aria-label="Jour précédent">‹</button>
        <div className="date-heading" aria-live="polite">
          <div className="date-heading-label">
            {relative && <span>{relative}</span>}
            {activeHeadingTitle && (
              <span className={`active-event ${activeHeadingShift} ${day?.status ?? ''}`}>
                {activeHeadingTitle}
              </span>
            )}
            {!relative && !activeHeadingTitle && <span>Pas de shift</span>}
          </div>
          <h1>{formatDateTitle(date)}</h1>
        </div>
        <button className="arrow" onClick={() => moveWithTransition(1)} aria-label="Jour suivant">›</button>
        <span className={`sync-dot ${loading ? 'syncing' : ''}`} aria-label={loading ? 'Synchronisation en cours' : 'Synchronisé'} />
      </header>

      <section className={`shift-grid ${loading && !day ? 'is-loading' : ''}`} aria-busy={loading || Boolean(saving)}>
        <ShiftButton type="morning_short" active={day?.selection === 'morning_short'} status={day?.selection === 'morning_short' ? day.status : null} saving={saving === 'morning_short'} onChoose={choose} />
        <ShiftButton type="morning_long" active={day?.selection === 'morning_long'} status={day?.selection === 'morning_long' ? day.status : null} saving={saving === 'morning_long'} onChoose={choose} />
        <ShiftButton type="all_day_rh" active={day?.selection === 'all_day_rh'} status={day?.selection === 'all_day_rh' ? day.status : null} saving={saving === 'all_day_rh'} onChoose={choose} />
        <ShiftButton type="all_day_rc" active={day?.selection === 'all_day_rc'} status={day?.selection === 'all_day_rc' ? day.status : null} saving={saving === 'all_day_rc'} onChoose={choose} />
        <ShiftButton type="all_day_rf" active={day?.selection === 'all_day_rf'} status={day?.selection === 'all_day_rf' ? day.status : null} saving={saving === 'all_day_rf'} onChoose={choose} />
        <ShiftButton type="all_day_ca" active={day?.selection === 'all_day_ca'} status={day?.selection === 'all_day_ca' ? day.status : null} saving={saving === 'all_day_ca'} onChoose={choose} />
        <ShiftButton type="afternoon" active={day?.selection === 'afternoon'} status={day?.selection === 'afternoon' ? day.status : null} saving={saving === 'afternoon'} onChoose={choose} />
        <ShiftButton type="all_day_other" active={day?.selection === 'all_day_other'} status={day?.selection === 'all_day_other' ? day.status : null} saving={saving === 'all_day_other'} onChoose={choose} />
        <ShiftButton
          type="all_day_bike"
          active={Boolean(day?.bikeEvent)}
          saving={saving === 'all_day_bike'}
          detail={day?.bikeEvent ? `${extractBikeDistance(day.bikeEvent.title)} km` : undefined}
          onChoose={choose}
        />
      </section>

      {editingOther && (
        <div
          className="other-dialog-backdrop"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !saving) setEditingOther(false);
          }}
        >
          <form className="other-dialog" role="dialog" aria-modal="true" aria-labelledby="other-dialog-title" onSubmit={saveOther}>
            <p className="eyebrow">Événement personnalisé</p>
            <h2 id="other-dialog-title">Titre de l’événement</h2>
            <label htmlFor="other-title">Ce titre apparaîtra dans Google Calendar.</label>
            <input
              id="other-title"
              value={otherTitle}
              onChange={(event) => setOtherTitle(event.target.value)}
              maxLength={200}
              required
              autoFocus
              disabled={Boolean(saving)}
            />
            {error && <p className="dialog-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={() => setEditingOther(false)} disabled={Boolean(saving)}>Annuler</button>
              <button type="submit" disabled={Boolean(saving) || !otherTitle.trim()}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingBike && (
        <div
          className="other-dialog-backdrop"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !saving) setEditingBike(false);
          }}
        >
          <form className="other-dialog bike-dialog" role="dialog" aria-modal="true" aria-labelledby="bike-dialog-title" onSubmit={saveBike}>
            <p className="eyebrow">Sortie à vélo</p>
            <h2 id="bike-dialog-title">Kilométrage parcouru</h2>
            <label htmlFor="bike-kilometers">Distance en kilomètres</label>
            <input
              id="bike-kilometers"
              type="number"
              inputMode="decimal"
              min="0.1"
              step="0.1"
              value={bikeKilometers}
              onChange={(event) => setBikeKilometers(event.target.value)}
              placeholder="Ex. 24,5"
              required
              autoFocus
              disabled={Boolean(saving)}
            />
            <p className="title-preview">Titre créé : 🚲 {bikeKilometers || '…'} km</p>
            {error && <p className="dialog-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={() => setEditingBike(false)} disabled={Boolean(saving)}>Annuler</button>
              <button type="submit" disabled={Boolean(saving) || !bikeKilometers}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

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
  status,
  saving,
  detail,
  onChoose,
}: {
  type: ShiftType;
  active: boolean;
  status?: ShiftStatus | null;
  saving: boolean;
  detail?: string;
  onChoose: (type: ShiftType, status?: ShiftStatus) => void;
}) {
  const copy = SHIFT_COPY[type];
  if (type === 'all_day_bike') {
    return (
      <button
        type="button"
        className={`shift-card ${type} ${active ? 'active' : ''}`}
        aria-pressed={active}
        onClick={() => onChoose(type)}
      >
        <span className="shift-note">{copy.note}</span>
        <strong>{copy.name}</strong>
        <span className="shift-time">{detail || copy.time}</span>
        <span className="selection-state">{saving ? 'Enregistrement…' : active ? '✓ Sélectionné' : 'Choisir'}</span>
      </button>
    );
  }

  const currentStatus = status ?? null;
  const primaryStatus: ShiftStatus = currentStatus ?? 'provisional';
  const alternateStatus: ShiftStatus = currentStatus === 'confirmed' ? 'provisional' : 'confirmed';
  const tileStatus = currentStatus ?? 'undefined';
  const statusLabel = primaryStatus === 'provisional' ? 'prévisionnel' : 'validé';
  const alternateLabel = alternateStatus === 'provisional' ? 'prévisionnel' : 'validé';
  return (
    <div className={`shift-card ${type} ${active ? 'active' : ''} ${tileStatus}`}>
      <span className="shift-note">{copy.note}</span>
      <strong>{copy.name}</strong>
      <span className="shift-time">{detail || copy.time}</span>
      <span className="selection-state">
        {saving ? 'Enregistrement…' : active ? currentStatus === 'provisional' ? 'Prévisionnel' : '✓ Validé' : 'Choisir'}
      </span>
      <button
        type="button"
        className="shift-action shift-main-action"
        aria-label={`${active ? 'Conserver' : 'Choisir'} ${copy.name} ${statusLabel}`}
        aria-pressed={active}
        onClick={() => onChoose(type, primaryStatus)}
      />
      <button
        type="button"
        className="shift-action shift-alternate-action"
        aria-label={`${active ? 'Passer' : 'Choisir'} ${copy.name} en ${alternateLabel}`}
        onClick={() => onChoose(type, alternateStatus)}
      />
    </div>
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

function extractBikeDistance(title: string | null | undefined): string {
  return title?.match(/\d+(?:[.,]\d+)?/)?.[0].replace(',', '.') ?? '';
}

function stripProvisionalTitlePrefix(title: string | null | undefined): string {
  return title?.trim().replace(/^\u2753\s*/u, '').trim() ?? '';
}

function waitForPageTransition(duration: number): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}
