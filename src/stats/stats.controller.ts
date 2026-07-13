import { BadRequestException, Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatsService } from './stats.service';

type Req = { user: { userId: string } };

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  overview(@Request() req: Req) {
    return this.statsService.overview(req.user.userId);
  }

  @Get('wrapped')
  wrapped(@Request() req: Req, @Query('year') year?: string, @Query('month') month?: string) {
    const yearNum = Number(year);
    if (!year || !Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new BadRequestException('A valid year query parameter is required');
    }
    let monthNum: number | undefined;
    if (month !== undefined) {
      monthNum = Number(month);
      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        throw new BadRequestException('month must be between 1 and 12');
      }
    }
    return this.statsService.wrapped(req.user.userId, yearNum, monthNum);
  }
}
