import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { SelectShiftDto } from './select-shift.dto';

@Controller('calendar/days')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get(':date')
  getDay(@Param('date') date: string) {
    return this.calendar.getDay(date);
  }

  @Put(':date/shift')
  selectShift(@Param('date') date: string, @Body() body: SelectShiftDto) {
    return this.calendar.selectShift(date, body.shift, body.title);
  }
}
