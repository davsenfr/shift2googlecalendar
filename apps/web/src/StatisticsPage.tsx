import { useEffect, useMemo, useState } from 'react';
import { api, CalendarStatistics, ShiftType } from './api';
import { firstDayOfCurrentYear, formatShortDate, today } from './date';

const STATISTIC_SHIFTS: Array<{
  type: Exclude<ShiftType, 'all_day_bike'>;
  label: string;
  detail?: string;
}> = [
  { type: 'morning_short', label: 'Matin', detail: '6h45 — 13h45' },
  { type: 'morning_long', label: 'Matin', detail: '6h45 — 14h45' },
  { type: 'all_day_rh', label: 'RH' },
  { type: 'all_day_rc', label: 'RC' },
  { type: 'all_day_rf', label: 'RF' },
  { type: 'all_day_ca', label: 'CA' },
  { type: 'afternoon', label: 'Après-midi', detail: '13h30 — 21h30' },
  { type: 'all_day_other', label: 'Autres' },
];

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export default function StatisticsPage() {
  const [since, setSince] = useState(firstDayOfCurrentYear);
  const [statistics, setStatistics] = useState<CalendarStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.statistics(since, controller.signal)
      .then((result) => {
        setStatistics(result);
        setError(null);
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey, since]);

  const shiftTotal = useMemo(() => {
    if (!statistics) return 0;
    return STATISTIC_SHIFTS.reduce(
      (total, shift) => total + statistics.counts[shift.type],
      0,
    );
  }, [statistics]);

  return (
    <main className="statistics-page" aria-busy={loading}>
      <header className="statistics-header">
        <div>
          <p className="eyebrow">Votre activité</p>
          <h1>Statistiques</h1>
        </div>
        <label className="statistics-since">
          <span>Depuis</span>
          <input
            type="date"
            value={since}
            max={today()}
            onChange={(event) => setSince(event.target.value)}
          />
        </label>
      </header>

      {error && !statistics ? (
        <section className="statistics-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            Réessayer
          </button>
        </section>
      ) : (
        <>
          <section className={`statistics-summary ${loading ? 'is-loading' : ''}`}>
            <article className="statistic-highlight shifts-total">
              <span>Shifts</span>
              <strong>{numberFormatter.format(shiftTotal)}</strong>
              <small>
                {statistics
                  ? `${formatShortDate(statistics.since)} — ${formatShortDate(statistics.until)}`
                  : 'Chargement…'}
              </small>
            </article>
            <article className="statistic-highlight bike-total">
              <span>Vélo</span>
              <strong>
                {numberFormatter.format(statistics?.bikeKilometers ?? 0)} <small>km</small>
              </strong>
              <small>
                {statistics
                  ? `${numberFormatter.format(statistics.counts.all_day_bike)} ${statistics.counts.all_day_bike > 1 ? 'sorties' : 'sortie'}`
                  : 'Chargement…'}
              </small>
            </article>
          </section>

          <section className={`statistics-detail ${loading ? 'is-loading' : ''}`}>
            <div className="statistics-section-heading">
              <p className="eyebrow">Répartition</p>
              <h2>Par type de shift</h2>
            </div>
            <div className="statistics-grid">
              {STATISTIC_SHIFTS.map((shift) => (
                <article className={`statistic-card ${shift.type}`} key={shift.type}>
                  <div>
                    <strong>{shift.label}</strong>
                    {shift.detail && <span>{shift.detail}</span>}
                  </div>
                  <b>{numberFormatter.format(statistics?.counts[shift.type] ?? 0)}</b>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {error && statistics && <aside className="statistics-inline-error" role="alert">{error}</aside>}
    </main>
  );
}
