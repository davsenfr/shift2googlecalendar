import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { SelectShiftDto } from './select-shift.dto';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('statistics')
  getStatistics(@Query('since') since?: string) {
    return this.calendar.getStatistics(since);
  }

  @Get('days/:date')
  getDay(@Param('date') date: string) {
    return this.calendar.getDay(date);
  }

  @Put('days/:date/shift')
  selectShift(@Param('date') date: string, @Body() body: SelectShiftDto) {
    return this.calendar.selectShift(date, body.shift, body.title, body.status, body.eventId);
  }
}
