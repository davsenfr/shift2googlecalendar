export const SHIFT_TYPES = [
  'morning_short',
  'morning_long',
  'all_day_rh',
  'all_day_rc',
  'all_day_rf',
  'afternoon',
] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export type ShiftDefinition = {
  type: ShiftType;
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
};

export const SHIFTS: Record<ShiftType, ShiftDefinition> = {
  morning_short: {
    type: 'morning_short',
    title: 'Matin',
    start: '06:45',
    end: '13:45',
  },
  morning_long: {
    type: 'morning_long',
    title: 'Matin',
    start: '06:45',
    end: '14:45',
  },
  all_day_rh: {
    type: 'all_day_rh',
    title: 'RH',
    allDay: true,
  },
  all_day_rc: {
    type: 'all_day_rc',
    title: 'RC',
    allDay: true,
  },
  all_day_rf: {
    type: 'all_day_rf',
    title: 'RF',
    allDay: true,
  },
  afternoon: {
    type: 'afternoon',
    title: 'Après midi',
    start: '13:30',
    end: '21:30',
  },
};
