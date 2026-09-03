import { ConfigService } from '@nestjs/config';
import { calendar, calendar_v3 } from '@googleapis/calendar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthService } from '../src/auth/google-auth.service';
import { CalendarService } from '../src/calendar/calendar.service';

vi.mock('@googleapis/calendar', () => ({
  calendar: vi.fn(),
}));

describe('CalendarService', () => {
  const listEvents = vi.fn();
  const updateEvent = vi.fn();
  const insertEvent = vi.fn();
  const handleAuthError = vi.fn();
  let service: CalendarService;

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.mocked(calendar).mockReturnValue({
      events: {
        insert: insertEvent,
        list: listEvents,
        update: updateEvent,
      },
    } as unknown as calendar_v3.Calendar);

    const config = {
      get: vi.fn((_key: string, fallback: string) => fallback),
    } as unknown as ConfigService;
    const googleAuth = {
      getAuthorizedClient: vi.fn().mockResolvedValue({}),
      handleAuthError,
    } as unknown as GoogleAuthService;

    service = new CalendarService(config, googleAuth);
  });

  it('delegates a late Google token refresh failure to the auth service', async () => {
    const invalidGrant = {
      cause: { message: 'invalid_grant' },
      code: 400,
    };
    const unauthorized = new Error('Reconnectez Google Calendar.');
    listEvents.mockRejectedValue(invalidGrant);
    handleAuthError.mockRejectedValue(unauthorized);

    await expect(service.getDay('2026-07-23')).rejects.toBe(unauthorized);

    expect(handleAuthError).toHaveBeenCalledWith(invalidGrant);
  });

  it('updates and adopts the exact external Google event', async () => {
    const externalEvent: calendar_v3.Schema$Event = {
      id: 'external-event',
      summary: 'Matin',
      colorId: '2',
      start: { dateTime: '2026-07-23T06:45:00+02:00' },
      end: { dateTime: '2026-07-23T13:45:00+02:00' },
    };
    const adoptedEvent: calendar_v3.Schema$Event = {
      ...externalEvent,
      summary: '\u2753 Matin',
      colorId: '8',
      extendedProperties: {
        private: {
          shiftToGc: 'v1',
          shiftDate: '2026-07-23',
          shiftType: 'morning_short',
          shiftStatus: 'provisional',
        },
      },
    };

    listEvents
      .mockResolvedValueOnce({ data: { items: [externalEvent] } })
      .mockResolvedValueOnce({ data: { items: [adoptedEvent] } });
    updateEvent.mockResolvedValue({ data: adoptedEvent });

    const state = await service.selectShift(
      '2026-07-23',
      'morning_short',
      undefined,
      'provisional',
      'external-event',
    );

    expect(updateEvent).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'external-event',
      requestBody: expect.objectContaining({
        colorId: '8',
        summary: '\u2753 Matin',
        extendedProperties: {
          private: expect.objectContaining({
            shiftToGc: 'v1',
            shiftStatus: 'provisional',
          }),
        },
      }),
    });
    expect(insertEvent).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      selection: 'morning_short',
      status: 'provisional',
      event: {
        id: 'external-event',
        managedByApp: true,
      },
    });
  });

  it('returns shift counts and cumulative bike kilometers since the start of the year', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T10:00:00+02:00'));
    listEvents
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              summary: 'Matin',
              start: { dateTime: '2026-02-02T06:45:00+01:00' },
              end: { dateTime: '2026-02-02T13:45:00+01:00' },
            },
            {
              summary: '\u{1F6B2} 12,5 km',
              start: { date: '2026-03-01' },
              end: { date: '2026-03-02' },
            },
          ],
          nextPageToken: 'next-page',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              summary: '\u{1F6B2} 1\u202F234,75 km',
              start: { date: '2026-08-10' },
              end: { date: '2026-08-11' },
              extendedProperties: {
                private: {
                  shiftToGc: 'v1',
                  shiftType: 'all_day_bike',
                },
              },
            },
            {
              summary: 'Unrelated event',
              start: { date: '2026-04-01' },
              end: { date: '2026-04-02' },
            },
          ],
        },
      });

    const statistics = await service.getStatistics();

    expect(statistics).toEqual({
      since: '2026-01-01',
      until: '2026-08-12',
      counts: {
        morning_short: 1,
        morning_long: 0,
        all_day_rh: 0,
        all_day_rc: 0,
        all_day_rf: 0,
        all_day_ca: 0,
        afternoon: 0,
        all_day_other: 0,
        all_day_bike: 2,
      },
      bikeKilometers: 1247.25,
    });
    expect(listEvents).toHaveBeenNthCalledWith(1, {
      calendarId: 'primary',
      timeMin: '2025-12-31T23:00:00.000Z',
      timeMax: '2026-08-12T22:00:00.000Z',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });
    expect(listEvents).toHaveBeenNthCalledWith(2, {
      calendarId: 'primary',
      timeMin: '2025-12-31T23:00:00.000Z',
      timeMax: '2026-08-12T22:00:00.000Z',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken: 'next-page',
    });
  });

  it('uses an explicit statistics start date and rejects future dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T10:00:00+02:00'));
    listEvents.mockResolvedValue({ data: { items: [] } });

    await expect(service.getStatistics('2026-07-01')).resolves.toMatchObject({
      since: '2026-07-01',
      until: '2026-08-12',
    });
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({
      timeMin: '2026-06-30T22:00:00.000Z',
    }));

    await expect(service.getStatistics('2026-08-13')).rejects.toThrow(
      'La date de début ne peut pas être dans le futur.',
    );
  });

  it('creates a confirmed afternoon shift with the Google lavender color', async () => {
    const createdEvent: calendar_v3.Schema$Event = {
      id: 'afternoon-event',
      summary: 'Après midi',
      colorId: '1',
      start: { dateTime: '2026-07-23T13:30:00+02:00' },
      end: { dateTime: '2026-07-23T21:30:00+02:00' },
      extendedProperties: {
        private: {
          shiftToGc: 'v1',
          shiftDate: '2026-07-23',
          shiftType: 'afternoon',
          shiftStatus: 'confirmed',
        },
      },
    };

    listEvents
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({ data: { items: [createdEvent] } });
    insertEvent.mockResolvedValue({ data: createdEvent });

    const state = await service.selectShift(
      '2026-07-23',
      'afternoon',
      undefined,
      'confirmed',
    );

    expect(insertEvent).toHaveBeenCalledWith({
      calendarId: 'primary',
      requestBody: expect.objectContaining({
        colorId: '1',
        summary: 'Après midi',
      }),
    });
    expect(state).toMatchObject({
      selection: 'afternoon',
      status: 'confirmed',
      event: {
        id: 'afternoon-event',
        managedByApp: true,
      },
    });
  });

  it('retrieves the Google event title for an all-day other shift', async () => {
    const googleEvent: calendar_v3.Schema$Event = {
      id: 'other-event',
      summary: 'Formation sécurité',
      colorId: '3',
      start: { date: '2026-07-23' },
      end: { date: '2026-07-24' },
      extendedProperties: {
        private: {
          shiftToGc: 'v1',
          shiftDate: '2026-07-23',
          shiftType: 'all_day_other',
          shiftStatus: 'confirmed',
        },
      },
    };

    listEvents.mockResolvedValue({ data: { items: [googleEvent] } });

    const state = await service.getDay('2026-07-23');

    expect(state).toMatchObject({
      selection: 'all_day_other',
      status: 'confirmed',
      event: {
        id: 'other-event',
        title: 'Formation sécurité',
        managedByApp: true,
      },
    });
  });

  it('updates the Google event title when an all-day other title is modified', async () => {
    const googleEvent: calendar_v3.Schema$Event = {
      id: 'other-event',
      summary: 'Formation initiale',
      colorId: '3',
      start: { date: '2026-07-23' },
      end: { date: '2026-07-24' },
      extendedProperties: {
        private: {
          shiftToGc: 'v1',
          shiftDate: '2026-07-23',
          shiftType: 'all_day_other',
          shiftStatus: 'confirmed',
        },
      },
    };
    const updatedGoogleEvent: calendar_v3.Schema$Event = {
      ...googleEvent,
      summary: 'Formation avancée',
    };

    listEvents
      .mockResolvedValueOnce({ data: { items: [googleEvent] } })
      .mockResolvedValueOnce({ data: { items: [updatedGoogleEvent] } });
    updateEvent.mockResolvedValue({ data: updatedGoogleEvent });

    const state = await service.selectShift(
      '2026-07-23',
      'all_day_other',
      'Formation avancée',
      'confirmed',
    );

    expect(updateEvent).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'other-event',
      requestBody: expect.objectContaining({
        summary: 'Formation avancée',
        extendedProperties: {
          private: expect.objectContaining({
            shiftType: 'all_day_other',
          }),
        },
      }),
    });
    expect(insertEvent).not.toHaveBeenCalled();
    expect(state.event).toMatchObject({
      id: 'other-event',
      title: 'Formation avancée',
      managedByApp: true,
    });
  });

  it('rejects an event ID that is not present on the requested day', async () => {
    listEvents.mockResolvedValue({ data: { items: [] } });

    await expect(
      service.selectShift(
        '2026-07-23',
        'morning_short',
        undefined,
        'confirmed',
        'missing-event',
      ),
    ).rejects.toThrow(
      'L’événement Google Calendar à modifier est introuvable pour cette date.',
    );

    expect(updateEvent).not.toHaveBeenCalled();
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it('rejects a Google event whose start and end times are outside the requested shift', async () => {
    const externalEvent: calendar_v3.Schema$Event = {
      id: 'external-event',
      summary: 'Matin',
      colorId: '2',
      start: { dateTime: '2026-07-23T05:45:00+02:00' },
      end: { dateTime: '2026-07-23T14:45:00+02:00' },
    };

    listEvents.mockResolvedValue({ data: { items: [externalEvent] } });

    await expect(
      service.selectShift(
        '2026-07-23',
        'morning_short',
        undefined,
        'confirmed',
        'external-event',
      ),
    ).rejects.toThrow(
      'L’événement Google Calendar ne correspond plus à l’horaire affiché.',
    );

    expect(updateEvent).not.toHaveBeenCalled();
    expect(insertEvent).not.toHaveBeenCalled();
  });
});
