import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { addDays, today } from './date';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    authStatus: vi.fn(),
    day: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('./api', () => ({
  API_BASE: '/api',
  api: apiMock,
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
