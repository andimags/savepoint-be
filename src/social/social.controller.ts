import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocialService } from './social.service';

type Req = { user: { userId: string } };

@UseGuards(JwtAuthGuard)
@Controller()
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('users/search')
  search(@Request() req: Req, @Query('q') q?: string) {
    const query = q?.trim();
    if (!query) {
      throw new BadRequestException('Query parameter q is required');
    }
    return this.socialService.searchUsers(req.user.userId, query);
  }

  @Get('feed/activity')
  activity(@Request() req: Req, @Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(30, Math.max(1, Number(limit) || 10));
    return this.socialService.activityFeed(req.user.userId, pageNum, limitNum);
  }

  @Get('users/:id')
  profile(@Request() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.profile(id, req.user.userId);
  }

  @Get('users/:id/profile-stats')
  profileStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.profileStats(id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('users/:id/follow')
  async follow(@Request() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    await this.socialService.follow(req.user.userId, id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('users/:id/follow')
  async unfollow(@Request() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    await this.socialService.unfollow(req.user.userId, id);
  }

  @Get('users/:id/followers')
  followers(@Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.followers(id);
  }

  @Get('users/:id/following')
  following(@Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.following(id);
  }

  @Get('feed/playing')
  playingFeed(@Request() req: Req) {
    return this.socialService.playingFeed(req.user.userId);
  }
}
