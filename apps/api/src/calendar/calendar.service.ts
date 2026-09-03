import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar, calendar_v3 } from '@googleapis/calendar';
import { DateTime } from 'luxon';
import { GoogleAuthService } from '../auth/google-auth.service';
import { SHIFTS, SHIFT_TYPES, ShiftDefinition, ShiftStatus, ShiftType } from './shifts';

const APP_MARKER_KEY = 'shiftToGc';
const APP_MARKER_VALUE = 'v1';
const PROVISIONAL_GOOGLE_COLOR_ID = '8';
const PROVISIONAL_TITLE_PREFIX = '❓';

export type DayState = {
  date: string;
  selection: ShiftType | null;
  status: ShiftStatus | null;
  event: CalendarEventState | null;
  bikeEvent: CalendarEventState | null;
  duplicateCount: number;
  syncedAt: string;
};

export type CalendarStatistics = {
  since: string;
  until: string;
  counts: Record<ShiftType, number>;
  bikeKilometers: number;
};

type CalendarEventState = {
  id: string | null;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  htmlLink: string | null;
  managedByApp: boolean;
  modifiedInGoogle: boolean;
};

@Injectable()
export class CalendarService {
  private readonly calendarId: string;
  private readonly timeZone: string;

  constructor(
    private readonly config: ConfigService,
    private readonly googleAuth: GoogleAuthService,
  ) {
    this.calendarId = config.get<string>('GOOGLE_CALENDAR_ID', 'primary');
    this.timeZone = config.get<string>('GOOGLE_CALENDAR_TIMEZONE', 'Europe/Paris');
  }

  async getDay(date: string): Promise<DayState> {
    const day = this.parseDate(date);
    const calendar = await this.getCalendarClient();
    const events = await this.listEvents(calendar, day);
    return this.toDayState(date, events);
  }

  async getStatistics(since?: string): Promise<CalendarStatistics> {
    const today = DateTime.now().setZone(this.timeZone).startOf('day');
    const firstDay = since ? this.parseDate(since) : today.startOf('year');
    if (firstDay > today) {
      throw new BadRequestException('La date de début ne peut pas être dans le futur.');
    }

    const calendar = await this.getCalendarClient();
    const events = await this.listEventsBetween(calendar, firstDay, today.plus({ days: 1 }));
    const counts = Object.fromEntries(
      SHIFT_TYPES.map((shiftType) => [shiftType, 0]),
    ) as Record<ShiftType, number>;
    let bikeKilometers = 0;

    for (const event of events) {
      const shiftType = this.matchShift(event);
      if (!shiftType) continue;

      counts[shiftType] += 1;
      if (shiftType === 'all_day_bike') {
        bikeKilometers += this.parseBikeKilometers(event.summary ?? '');
      }
    }

    return {
      since: firstDay.toISODate() as string,
      until: today.toISODate() as string,
      counts,
      bikeKilometers: Math.round(bikeKilometers * 100) / 100,
    };
  }

  async selectShift(
    date: string,
    shiftType: ShiftType,
    customTitle?: string,
    status: ShiftStatus = 'confirmed',
    eventId?: string,
  ): Promise<DayState> {
    const day = this.parseDate(date);
    const calendar = await this.getCalendarClient();
    const events = await this.listEvents(calendar, day);
    const shift = SHIFTS[shiftType];
    const effectiveStatus = shiftType === 'all_day_bike' ? 'confirmed' : status;
    const resource = this.eventResource(date, shift, customTitle, effectiveStatus);
    const managedEvent = events.find((event) =>
      this.isManaged(event) && this.isBikeEvent(event) === (shiftType === 'all_day_bike'),
    );
    const matchingUnmanagedEvent = events.find(
      (event) => !this.isManaged(event) && this.matchShift(event) === shiftType,
    );
    const requestedEvent = eventId
      ? events.find((event) => event.id === eventId)
      : undefined;
    if (eventId && !requestedEvent) {
      throw new BadRequestException(
        'L’événement Google Calendar à modifier est introuvable pour cette date.',
      );
    }
    if (requestedEvent && this.matchShift(requestedEvent) !== shiftType) {
      throw new BadRequestException(
        'L’événement Google Calendar ne correspond plus à l’horaire affiché.',
      );
    }
    const eventToUpdate = requestedEvent ?? managedEvent ?? matchingUnmanagedEvent;

    if (eventToUpdate?.id) {
      const eventId = eventToUpdate.id;
      await this.executeGoogleRequest(() =>
        calendar.events.update({
          calendarId: this.calendarId,
          eventId,
          requestBody: resource,
        }),
      );
    } else {
      await this.executeGoogleRequest(() =>
        calendar.events.insert({
          calendarId: this.calendarId,
          requestBody: resource,
        }),
      );
    }

    return this.getDay(date);
  }

  private async getCalendarClient(): Promise<calendar_v3.Calendar> {
    return calendar({
      version: 'v3',
      auth: await this.googleAuth.getAuthorizedClient(),
    });
  }

  private async listEvents(
    calendar: calendar_v3.Calendar,
    day: DateTime,
  ): Promise<calendar_v3.Schema$Event[]> {
    const response = await this.executeGoogleRequest(() =>
      calendar.events.list({
        calendarId: this.calendarId,
        timeMin: day.startOf('day').toUTC().toISO() ?? undefined,
        timeMax: day.plus({ days: 1 }).startOf('day').toUTC().toISO() ?? undefined,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      }),
    );
    return response.data.items ?? [];
  }

  private async listEventsBetween(
    calendar: calendar_v3.Calendar,
    firstDay: DateTime,
    endExclusive: DateTime,
  ): Promise<calendar_v3.Schema$Event[]> {
    const events: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;

    do {
      const response = await calendar.events.list({
        calendarId: this.calendarId,
        timeMin: firstDay.toUTC().toISO() ?? undefined,
        timeMax: endExclusive.toUTC().toISO() ?? undefined,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        ...(pageToken ? { pageToken } : {}),
      });
      events.push(...(response.data.items ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return events;
  }

  private async executeGoogleRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      return this.googleAuth.handleAuthError(error);
    }
  }

  private toDayState(date: string, events: calendar_v3.Schema$Event[]): DayState {
    const candidates = events.filter((event) => this.isManaged(event) || this.matchShift(event));
    const bikeCandidates = candidates.filter((event) => this.isBikeEvent(event));
    const shiftCandidates = candidates.filter((event) => !this.isBikeEvent(event));
    const event = this.pickRelevantEvent(shiftCandidates);
    const bikeEvent = this.pickRelevantEvent(bikeCandidates);
    const selection = event ? this.matchShift(event) : null;

    return {
      date,
      selection,
      status: event ? this.getShiftStatus(event) : null,
      event: this.toEventState(event, selection),
      bikeEvent: this.toEventState(bikeEvent, bikeEvent ? this.matchShift(bikeEvent) : null),
      duplicateCount:
        Math.max(0, shiftCandidates.length - 1) + Math.max(0, bikeCandidates.length - 1),
      syncedAt: new Date().toISOString(),
    };
  }

  private toEventState(
    event: calendar_v3.Schema$Event | undefined,
    selection: ShiftType | null,
  ): CalendarEventState | null {
    if (!event) return null;

    return {
      id: event.id ?? null,
      title: event.summary ?? '',
      startsAt: event.start?.dateTime ?? event.start?.date ?? null,
      endsAt: event.end?.dateTime ?? event.end?.date ?? null,
      htmlLink: event.htmlLink ?? null,
      managedByApp: this.isManaged(event),
      modifiedInGoogle: this.isManaged(event) && selection === null,
    };
  }

  private pickRelevantEvent(
    events: calendar_v3.Schema$Event[],
  ): calendar_v3.Schema$Event | undefined {
    return events.find((event) => this.isManaged(event)) ?? events.find((event) => this.matchShift(event));
  }

  private isManaged(event: calendar_v3.Schema$Event): boolean {
    return event.extendedProperties?.private?.[APP_MARKER_KEY] === APP_MARKER_VALUE;
  }

  private getShiftStatus(event: calendar_v3.Schema$Event): ShiftStatus {
    return event.colorId === PROVISIONAL_GOOGLE_COLOR_ID
      ? 'provisional'
      : 'confirmed';
  }

  private isBikeEvent(event: calendar_v3.Schema$Event): boolean {
    return event.extendedProperties?.private?.shiftType === 'all_day_bike' ||
      this.matchShift(event) === 'all_day_bike';
  }

  private matchShift(event: calendar_v3.Schema$Event): ShiftType | null {
    const normalizedTitle = this.stripProvisionalTitlePrefix(event.summary ?? '');
    const managedShiftType = event.extendedProperties?.private?.shiftType;

    if (
      this.isManaged(event) &&
      SHIFT_TYPES.includes(managedShiftType as ShiftType) &&
      SHIFTS[managedShiftType as ShiftType].editableTitle &&
      event.start?.date &&
      event.end?.date
    ) {
      return managedShiftType as ShiftType;
    }

    for (const shift of Object.values(SHIFTS)) {
      if (shift.allDay) {
        if (
          event.start?.date &&
          event.end?.date &&
          shift.titleMatch.test(normalizedTitle)
        ) {
          return shift.type;
        }
        continue;
      }

      if (!event.start?.dateTime || !event.end?.dateTime || !shift.start || !shift.end) {
        continue;
      }
      const start = DateTime.fromISO(event.start.dateTime).setZone(this.timeZone).toFormat('HH:mm');
      const end = DateTime.fromISO(event.end.dateTime).setZone(this.timeZone).toFormat('HH:mm');
      if (
        shift.start === start &&
        shift.end === end &&
        (this.isManaged(event) || shift.titleMatch.test(normalizedTitle))
      ) {
        return shift.type;
      }
    }
    return null;
  }

  private eventResource(
    date: string,
    shift: ShiftDefinition,
    customTitle?: string,
    status: ShiftStatus = 'confirmed',
  ): calendar_v3.Schema$Event {
    const customTitleValue = customTitle
      ? this.stripProvisionalTitlePrefix(customTitle)
      : undefined;
    if (shift.editableTitle && !customTitleValue) {
      throw new BadRequestException('Le titre de l’événement est obligatoire.');
    }
    const title = shift.titlePrefix && !customTitleValue?.startsWith(shift.titlePrefix)
      ? `${shift.titlePrefix} ${customTitleValue}`
      : customTitleValue;

    const timing = shift.allDay
      ? {
          start: { date },
          end: { date: this.parseDate(date).plus({ days: 1 }).toISODate() as string },
        }
      : {
          start: {
            dateTime: this.dateTime(date, shift.start as string),
            timeZone: this.timeZone,
          },
          end: {
            dateTime: this.dateTime(date, shift.end as string),
            timeZone: this.timeZone,
          },
        };

    const eventTitle = shift.editableTitle ? title as string : shift.title;

    return {
      summary: status === 'provisional'
        ? `${PROVISIONAL_TITLE_PREFIX} ${eventTitle}`
        : eventTitle,
      description: 'Créé avec Shift to Google Calendar',
      colorId: status === 'provisional' ? PROVISIONAL_GOOGLE_COLOR_ID : shift.googleColorId,
      ...timing,
      extendedProperties: {
        private: {
          [APP_MARKER_KEY]: APP_MARKER_VALUE,
          shiftDate: date,
          shiftType: shift.type,
          shiftStatus: status,
        },
      },
    };
  }

  private dateTime(date: string, time: string): string {
    const value = DateTime.fromISO(`${date}T${time}`, { zone: this.timeZone });
    if (!value.isValid) throw new BadRequestException('Date ou fuseau horaire invalide.');
    return value.toISO({ suppressMilliseconds: true }) as string;
  }

  private stripProvisionalTitlePrefix(title: string): string {
    return title.trim().replace(/^\u2753\s*/u, '').trim();
  }

  private parseBikeKilometers(title: string): number {
    const distance = title.match(/(\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?)\s*km\b/iu)?.[1];
    if (!distance) return 0;

    const value = Number(distance.replace(/[\s\u00a0\u202f]/gu, '').replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  private parseDate(date: string): DateTime {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('La date doit être au format AAAA-MM-JJ.');
    }
    const parsed = DateTime.fromISO(date, { zone: this.timeZone });
    if (!parsed.isValid || parsed.toISODate() !== date) {
      throw new BadRequestException('Date invalide.');
    }
    return parsed;
  }
}
