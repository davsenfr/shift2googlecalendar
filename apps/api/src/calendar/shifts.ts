export const SHIFT_TYPES = [
  'morning_short',
  'morning_long',
  'all_day_rh',
  'all_day_rc',
  'all_day_rf',
  'all_day_ca',
  'afternoon',
  'all_day_other',
  'all_day_bike',
] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const SHIFT_STATUSES = ['provisional', 'confirmed'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export type ShiftDefinition = {
  type: ShiftType;
  title: string;
  titleMatch: RegExp;
  start?: string;
  end?: string;
  allDay?: boolean;
  googleColorId?: string;
  editableTitle?: boolean;
  titlePrefix?: string;
};

export const SHIFTS: Record<ShiftType, ShiftDefinition> = {
  morning_short: {
    type: 'morning_short',
    title: 'Matin',
    titleMatch: /^Matin$/iu,
    start: '06:45',
    end: '13:45',
    googleColorId: '2',
  },
  morning_long: {
    type: 'morning_long',
    title: 'Matin',
    titleMatch: /^Matin$/iu,
    start: '06:45',
    end: '14:45',
    googleColorId: '10',
  },
  all_day_rh: {
    type: 'all_day_rh',
    title: 'RH',
    titleMatch: /^RH$/iu,
    allDay: true,
    googleColorId: '11',
  },
  all_day_rc: {
    type: 'all_day_rc',
    title: 'RC',
    titleMatch: /^RC$/iu,
    allDay: true,
    googleColorId: '11',
  },
  all_day_rf: {
    type: 'all_day_rf',
    title: 'RF',
    titleMatch: /^RF$/iu,
    allDay: true,
    googleColorId: '11',
  },
  all_day_ca: {
    type: 'all_day_ca',
    title: 'CA',
    titleMatch: /^CA$/iu,
    allDay: true,
    googleColorId: '11',
  },
  afternoon: {
    type: 'afternoon',
    title: 'Après midi',
    titleMatch: /^Apr[eè]s[\s-]midi$/iu,
    start: '13:30',
    end: '21:30',
    googleColorId: '1',
  },
  all_day_other: {
    type: 'all_day_other',
    title: 'Autres',
    titleMatch: /^Autres$/iu,
    allDay: true,
    googleColorId: '3',
    editableTitle: true,
  },
  all_day_bike: {
    type: 'all_day_bike',
    title: 'Vélo',
    titleMatch: /^🚲(?:\s|$)/u,
    allDay: true,
    googleColorId: '5',
    editableTitle: true,
    titlePrefix: '🚲',
  },
};
