import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SHIFT_STATUSES, SHIFT_TYPES, ShiftStatus, ShiftType } from './shifts';

export class SelectShiftDto {
  @IsIn(SHIFT_TYPES)
  shift: ShiftType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(SHIFT_STATUSES)
  status?: ShiftStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  eventId?: string;
}
