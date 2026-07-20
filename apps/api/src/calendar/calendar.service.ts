import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar_v3, google } from 'googleapis';
import { DateTime } from 'luxon';
import { GoogleAuthService } from '../auth/google-auth.service';
import { SHIFTS, ShiftDefinition, ShiftType } from './shifts';

const APP_MARKER_KEY = 'shiftToGc';
const APP_MARKER_VALUE = 'v1';

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

  async selectShift(date: string, shiftType: ShiftType, customTitle?: string): Promise<DayState> {
    const day = this.parseDate(date);
    const calendar = await this.getCalendarClient();
    const events = await this.listEvents(calendar, day);
    const shift = SHIFTS[shiftType];
    const resource = this.eventResource(date, shift, customTitle);
    const managedEvent = events.find((event) => this.isManaged(event));
    const matchingUnmanagedEvent = events.find(
      (event) => !this.isManaged(event) && this.matchShift(event) === shiftType,
    );

    if (managedEvent?.id) {
      await calendar.events.update({
        calendarId: this.calendarId,
        eventId: managedEvent.id,
        requestBody: resource,
      });
    } else if (!matchingUnmanagedEvent) {
      await calendar.events.insert({
        calendarId: this.calendarId,
        requestBody: resource,
      });
    }

    return this.getDay(date);
  }

  private async getCalendarClient(): Promise<calendar_v3.Calendar> {
    return google.calendar({
      version: 'v3',
      auth: await this.googleAuth.getAuthorizedClient(),
    });
  }

  private async listEvents(
    calendar: calendar_v3.Calendar,
    day: DateTime,
  ): Promise<calendar_v3.Schema$Event[]> {
    const response = await calendar.events.list({
      calendarId: this.calendarId,
      timeMin: day.startOf('day').toUTC().toISO() ?? undefined,
      timeMax: day.plus({ days: 1 }).startOf('day').toUTC().toISO() ?? undefined,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });
    return response.data.items ?? [];
  }

  private toDayState(date: string, events: calendar_v3.Schema$Event[]): DayState {
    const candidates = events.filter((event) => this.isManaged(event) || this.matchShift(event));
    const event = this.pickRelevantEvent(candidates);
    const selection = event ? this.matchShift(event) : null;

    return {
      date,
      selection,
      event: event
        ? {
            id: event.id ?? null,
            title: event.summary ?? '',
            startsAt: event.start?.dateTime ?? event.start?.date ?? null,
            endsAt: event.end?.dateTime ?? event.end?.date ?? null,
            htmlLink: event.htmlLink ?? null,
            managedByApp: this.isManaged(event),
            modifiedInGoogle: this.isManaged(event) && selection === null,
          }
        : null,
      duplicateCount: Math.max(0, candidates.length - 1),
      syncedAt: new Date().toISOString(),
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

  private matchShift(event: calendar_v3.Schema$Event): ShiftType | null {
    const normalizedTitle = (event.summary ?? '').trim().toLocaleLowerCase('fr');

    if (
      this.isManaged(event) &&
      event.extendedProperties?.private?.shiftType === 'all_day_other' &&
      event.start?.date &&
      event.end?.date
    ) {
      return 'all_day_other';
    }

    for (const shift of Object.values(SHIFTS)) {
      if (shift.allDay) {
        if (
          event.start?.date &&
          event.end?.date &&
          shift.title.toLocaleLowerCase('fr') === normalizedTitle
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
        (this.isManaged(event) || shift.title.toLocaleLowerCase('fr') === normalizedTitle)
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
  ): calendar_v3.Schema$Event {
    const title = customTitle?.trim();
    if (shift.editableTitle && !title) {
      throw new BadRequestException('Le titre de l’événement est obligatoire.');
    }

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

    return {
      summary: shift.editableTitle ? title : shift.title,
      description: 'Créé avec Shift to Google Calendar',
      colorId: shift.googleColorId,
      ...timing,
      extendedProperties: {
        private: {
          [APP_MARKER_KEY]: APP_MARKER_VALUE,
          shiftDate: date,
          shiftType: shift.type,
        },
      },
    };
  }

  private dateTime(date: string, time: string): string {
    const value = DateTime.fromISO(`${date}T${time}`, { zone: this.timeZone });
    if (!value.isValid) throw new BadRequestException('Date ou fuseau horaire invalide.');
    return value.toISO({ suppressMilliseconds: true }) as string;
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
