import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { addDays, firstDayOfCurrentYear, today } from './date';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    authStatus: vi.fn(),
    day: vi.fn(),
    statistics: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('./api', () => ({
  API_BASE: '/api',
  api: apiMock,
  isUnauthorizedError: (error: unknown) =>
    typeof error === 'object' && error !== null && 'status' in error && error.status === 401,
}));

const currentDate = today();

function externalMorning() {
  return {
    date: currentDate,
    selection: 'morning_short' as const,
    status: 'confirmed' as const,
    event: {
      id: 'external-event',
      title: 'Matin',
      startsAt: `${currentDate}T06:45:00+02:00`,
      endsAt: `${currentDate}T13:45:00+02:00`,
      htmlLink: null,
      managedByApp: false,
      modifiedInGoogle: false,
    },
    bikeEvent: null,
    duplicateCount: 0,
    syncedAt: new Date().toISOString(),
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    apiMock.authStatus.mockResolvedValue({
      configured: true,
      connected: true,
    });
    apiMock.day.mockResolvedValue(externalMorning());
    apiMock.statistics.mockResolvedValue({
      since: firstDayOfCurrentYear(),
      until: currentDate,
      counts: {
        morning_short: 3,
        morning_long: 2,
        all_day_rh: 1,
        all_day_rc: 0,
        all_day_rf: 0,
        all_day_ca: 1,
        afternoon: 4,
        all_day_other: 2,
        all_day_bike: 2,
      },
      bikeKilometers: 42.5,
    });
  });

  it('renders the relative day outside the event badge', async () => {
    render(<App />);

    const relativeDay = await screen.findByText('Aujourd’hui');
    await waitFor(() => {
      expect(
        relativeDay.parentElement?.querySelector('.active-event'),
      ).not.toBeNull();
    });
    const badge = relativeDay.parentElement?.querySelector('.active-event');
    if (!(badge instanceof HTMLElement)) {
      throw new Error('The active event badge was not rendered.');
    }

    expect(badge).toHaveClass('active-event');
    expect(badge).toHaveTextContent(/^Matin$/);
    expect(relativeDay).not.toHaveClass('active-event');
    expect(relativeDay.parentElement).toBe(badge.parentElement);
  });

  it('offers reconnection when the saved Google grant has expired', async () => {
    const authError = Object.assign(
      new Error('La connexion Google Calendar a expiré. Reconnectez Google Calendar.'),
      { status: 401 },
    );
    apiMock.day.mockRejectedValue(authError);

    render(<App />);

    expect(await screen.findByText(authError.message)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Connecter Google Calendar' }),
    ).toHaveAttribute('href', '/api/auth/google');
  });

  it('switches to statistics and displays the current-year totals', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Statistiques' }));

    expect(await screen.findByRole('heading', { name: 'Statistiques' })).toBeInTheDocument();
    expect(apiMock.statistics).toHaveBeenCalledWith(
      firstDayOfCurrentYear(),
      expect.any(AbortSignal),
    );
    expect(await screen.findByText(/42,5/)).toHaveTextContent('42,5 km');
    expect(screen.getByText('2 sorties')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Horaires' }));
    expect(await screen.findByText(/Aujourd/)).toBeInTheDocument();
  });

  it('reloads statistics when the start date changes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Statistiques' }));
    await screen.findByRole('heading', { name: 'Statistiques' });

    fireEvent.change(screen.getByLabelText('Depuis'), {
      target: { value: '2026-07-01' },
    });

    await waitFor(() => {
      expect(apiMock.statistics).toHaveBeenCalledWith(
        '2026-07-01',
        expect.any(AbortSignal),
      );
    });
  });

  it('stays on the current day when Google does not confirm the update', async () => {
    const user = userEvent.setup();
    apiMock.select.mockResolvedValue(externalMorning());
    render(<App />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Passer Matin en prévisionnel',
      }),
    );

    expect(apiMock.select).toHaveBeenCalledWith(
      currentDate,
      'morning_short',
      undefined,
      'provisional',
      'external-event',
    );
    expect(
      await screen.findByText(
        'Google Calendar n’a pas confirmé la modification de cet horaire.',
      ),
    ).toBeInTheDocument();
    expect(apiMock.day.mock.calls.map(([date]) => date)).not.toContain(
      addDays(currentDate, 1),
    );
  });

  it('loads the next day when Google confirms the event', async () => {
    const user = userEvent.setup();
    const confirmedMorning = externalMorning();
    confirmedMorning.event.managedByApp = true;
    apiMock.select.mockResolvedValue(confirmedMorning);
    render(<App />);

    await user.click(
      await screen.findByRole('button', {
        name: /Conserver Matin/,
      }),
    );

    expect(apiMock.select).toHaveBeenCalledWith(
      currentDate,
      'morning_short',
      undefined,
      'confirmed',
      'external-event',
    );
    await waitFor(() => {
      expect(apiMock.day.mock.calls.map(([date]) => date)).toContain(
        addDays(currentDate, 1),
      );
    });
  });
});
