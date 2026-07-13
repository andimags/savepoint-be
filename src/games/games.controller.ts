import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GamesService } from './games.service';

@UseGuards(JwtAuthGuard)
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('search')
  search(@Query('q') q?: string) {
    const query = q?.trim();
    if (!query) {
      throw new BadRequestException('Query parameter q is required');
    }
    return this.gamesService.search(query);
  }

  @Get('browse')
  browse() {
    return this.gamesService.browse();
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post('enrich')
  async enrich() {
    await this.gamesService.enqueueEnrichment();
    return { queued: true };
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.gamesService.getById(id);
  }
}
