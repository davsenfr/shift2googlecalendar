export const SHIFT_TYPES = [
  'morning_short',
  'morning_long',
  'all_day_rh',
  'all_day_rc',
  'all_day_rf',
  'all_day_ca',
  'afternoon',
] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export type ShiftDefinition = {
  type: ShiftType;
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  googleColorId?: string;
};

export const SHIFTS: Record<ShiftType, ShiftDefinition> = {
  morning_short: {
    type: 'morning_short',
    title: 'Matin',
    start: '06:45',
    end: '13:45',
    googleColorId: '2',
  },
  morning_long: {
    type: 'morning_long',
    title: 'Matin',
    start: '06:45',
    end: '14:45',
    googleColorId: '10',
  },
  all_day_rh: {
    type: 'all_day_rh',
    title: 'RH',
    allDay: true,
    googleColorId: '11',
  },
  all_day_rc: {
    type: 'all_day_rc',
    title: 'RC',
    allDay: true,
    googleColorId: '11',
  },
  all_day_rf: {
    type: 'all_day_rf',
    title: 'RF',
    allDay: true,
    googleColorId: '11',
  },
  all_day_ca: {
    type: 'all_day_ca',
    title: 'CA',
    allDay: true,
    googleColorId: '11',
  },
  afternoon: {
    type: 'afternoon',
    title: 'Après midi',
    start: '13:30',
    end: '21:30',
    googleColorId: '7',
  },
};
