import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { GamePlatform, GameStatus, UserGame } from './user-game.entity';
import { DiaryService } from '../diary/diary.service';

const STATUS_LABELS: Record<GameStatus, string> = {
  [GameStatus.FINISHED]: 'Finished',
  [GameStatus.PLAYING]: 'Currently Playing',
  [GameStatus.BACKLOG]: 'Backlog',
  [GameStatus.DROPPED]: 'Dropped',
};

const PLATFORM_LABELS: Record<GamePlatform, string> = {
  [GamePlatform.STEAM]: 'Steam',
  [GamePlatform.GOG]: 'GOG',
  [GamePlatform.EPIC]: 'Epic Games Store',
  [GamePlatform.XBOX]: 'Xbox',
  [GamePlatform.PLAYSTATION]: 'PlayStation',
  [GamePlatform.NINTENDO]: 'Nintendo',
  [GamePlatform.OTHER]: 'Other',
};

@Injectable()
export class UserGamesService {
  constructor(
    @InjectRepository(UserGame)
    private readonly userGamesRepository: Repository<UserGame>,
    private readonly diaryService: DiaryService,
  ) {}

  async upsert(
    userId: string,
    gameId: string,
    platform: GamePlatform,
    playtimeMinutes: number,
    lastPlayedAt: Date | null,
  ): Promise<UserGame> {
    const existing = await this.userGamesRepository.findOne({
      where: { userId, gameId, platform },
    });
    if (existing) {
      existing.playtimeMinutes = playtimeMinutes;
      existing.lastPlayedAt = lastPlayedAt ?? existing.lastPlayedAt;
      return this.userGamesRepository.save(existing);
    }
    const userGame = this.userGamesRepository.create({
      userId,
      gameId,
      platform,
      playtimeMinutes,
      lastPlayedAt,
    });
    return this.userGamesRepository.save(userGame);
  }

  async findPaginated(
    userId: string,
    page: number,
    limit: number,
    status?: GameStatus,
    gameId?: string,
  ) {
    const where: FindOptionsWhere<UserGame> = { userId };
    if (status) where.status = status;
    if (gameId) where.gameId = gameId;
    const [items, total] = await this.userGamesRepository.findAndCount({
      where,
      relations: { game: true },
      order: { playtimeMinutes: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async update(
    userId: string,
    userGameId: string,
    updates: { status?: GameStatus | null; platform?: GamePlatform },
  ): Promise<UserGame> {
    const userGame = await this.userGamesRepository.findOne({
      where: { id: userGameId },
      relations: { game: true },
    });
    if (!userGame) throw new NotFoundException('Library entry not found');
    if (userGame.userId !== userId)
      throw new ForbiddenException('Not your library entry');

    if (updates.platform && updates.platform !== userGame.platform) {
      await this.changePlatform(userGame, updates.platform);
    }

    // A caller may send an explicit null to clear the status, so distinguish "omitted"
    // (undefined) from "clear" (null) rather than relying on a truthiness check.
    if (updates.status !== undefined) {
      return this.setStatus(userId, userGameId, updates.status);
    }

    return userGame;
  }

  private async changePlatform(
    userGame: UserGame,
    platform: GamePlatform,
  ): Promise<void> {
    // The (userId, gameId, platform) unique index means moving to a platform the user already
    // tracks this game on would collide, so reject it with a clear message.
    const duplicate = await this.userGamesRepository.findOne({
      where: { userId: userGame.userId, gameId: userGame.gameId, platform },
    });
    if (duplicate) {
      throw new ConflictException(
        'This game is already in your library on that platform',
      );
    }
    userGame.platform = platform;
    await this.userGamesRepository.save(userGame);
  }

  async setStatus(
    userId: string,
    userGameId: string,
    status: GameStatus | null,
  ): Promise<UserGame> {
    const userGame = await this.userGamesRepository.findOne({
      where: { id: userGameId },
      relations: { game: true },
    });
    if (!userGame) throw new NotFoundException('Library entry not found');
    if (userGame.userId !== userId)
      throw new ForbiddenException('Not your library entry');

    const previousStatus = userGame.status;
    userGame.status = status;
    const saved = await this.userGamesRepository.save(userGame);

    // Auto-log a diary entry whenever the status actually changes to a real status
    if (status && status !== previousStatus) {
      await this.diaryService.create(userId, {
        gameId: userGame.gameId,
        playedOn: new Date().toISOString().slice(0, 10),
        platform: PLATFORM_LABELS[userGame.platform],
        status,
        note: `Marked as ${STATUS_LABELS[status]}`,
      });
    }

    return saved;
  }

  async remove(userId: string, userGameId: string): Promise<void> {
    const userGame = await this.userGamesRepository.findOne({
      where: { id: userGameId },
    });
    if (!userGame) throw new NotFoundException('Library entry not found');
    if (userGame.userId !== userId)
      throw new ForbiddenException('Not your library entry');

    await this.userGamesRepository.remove(userGame);
  }

  async addManual(
    userId: string,
    gameId: string,
    platform: GamePlatform,
    status: GameStatus | null,
  ): Promise<UserGame> {
    const existing = await this.userGamesRepository.findOne({
      where: { userId, gameId, platform },
      relations: { game: true },
    });
    if (existing) {
      if (status && status !== existing.status) {
        return this.setStatus(userId, existing.id, status);
      }
      return existing;
    }
    const created = await this.userGamesRepository.save(
      this.userGamesRepository.create({
        userId,
        gameId,
        platform,
        playtimeMinutes: 0,
      }),
    );
    if (status) {
      return this.setStatus(userId, created.id, status);
    }
    return this.userGamesRepository.findOneOrFail({
      where: { id: created.id },
      relations: { game: true },
    });
  }
}
