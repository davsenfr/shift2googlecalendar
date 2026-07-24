export const SHIFT_STATUSES = ['provisional', 'confirmed'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

type ShiftProperties = {
  title: string;
  titleMatch?: RegExp;
  start?: string;
  end?: string;
  allDay?: boolean;
  googleColorId?: string;
  editableTitle?: boolean;
  titlePrefix?: string;
};

type DefinedShift<Type extends string> = Omit<ShiftProperties, 'titleMatch'> & {
  type: Type;
  titleMatch: RegExp;
};

type DefinedShifts<Definitions extends Record<string, ShiftProperties>> = {
  [Type in keyof Definitions]: DefinedShift<Extract<Type, string>>;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const defineShifts = <const Definitions extends Record<string, ShiftProperties>>(
  definitions: Definitions,
): DefinedShifts<Definitions> =>
  Object.fromEntries(
    Object.entries(definitions).map(([type, properties]) => [
      type,
      {
        titleMatch: new RegExp(`^${escapeRegExp(properties.title)}$`, 'iu'),
        ...properties,
        type,
      },
    ]),
  ) as DefinedShifts<Definitions>;

const dayOff = (title: string): ShiftProperties => ({
  title,
  allDay: true,
  googleColorId: '11',
});

export const SHIFTS = defineShifts({
  morning_short: {
    title: 'Matin',
    start: '06:45',
    end: '13:45',
    googleColorId: '2',
  },
  morning_long: {
    title: 'Matin',
    start: '06:45',
    end: '14:45',
    googleColorId: '10',
  },
  all_day_rh: dayOff('RH'),
  all_day_rc: dayOff('RC'),
  all_day_rf: dayOff('RF'),
  all_day_ca: dayOff('CA'),
  afternoon: {
    title: 'Après midi',
    start: '13:30',
    end: '21:30',
    googleColorId: '7',
  },
  all_day_other: {
    title: 'Autres',
    allDay: true,
    googleColorId: '3',
    editableTitle: true,
  },
  all_day_bike: {
    title: 'Vélo',
    titleMatch: /^🚲(?:\s|$)/u,
    allDay: true,
    googleColorId: '5',
    editableTitle: true,
    titlePrefix: '🚲',
  },
});

export type ShiftType = Extract<keyof typeof SHIFTS, string>;
export type ShiftDefinition = (typeof SHIFTS)[ShiftType];

export const SHIFT_TYPES = Object.keys(SHIFTS) as ShiftType[];
