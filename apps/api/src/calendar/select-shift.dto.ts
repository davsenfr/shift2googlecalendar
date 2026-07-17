import { IsIn } from 'class-validator';
import { SHIFT_TYPES, ShiftType } from './shifts';

export class SelectShiftDto {
  @IsIn(SHIFT_TYPES)
  shift: ShiftType;
}
