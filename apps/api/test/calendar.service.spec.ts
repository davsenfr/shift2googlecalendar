import { ConfigService } from '@nestjs/config';
import { calendar_v3, google } from 'googleapis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthService } from '../src/auth/google-auth.service';
import { CalendarService } from '../src/calendar/calendar.service';

vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(),
  },
}));

describe('CalendarService', () => {
  const listEvents = vi.fn();
  const updateEvent = vi.fn();
  const insertEvent = vi.fn();
  let service: CalendarService;

  beforeEach(() => {
    vi.mocked(google.calendar).mockReturnValue({
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
    } as unknown as GoogleAuthService;

    service = new CalendarService(config, googleAuth);
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
