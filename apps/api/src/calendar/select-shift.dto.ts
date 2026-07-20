import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SHIFT_TYPES, ShiftType } from './shifts';

export class SelectShiftDto {
  @IsIn(SHIFT_TYPES)
  shift: ShiftType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
