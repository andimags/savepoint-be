import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserGame, GameStatus } from '../user-games/user-game.entity';
import { DiaryEntry } from '../diary/diary-entry.entity';
import { Review } from '../reviews/review.entity';
import { Rating } from '../ratings/rating.entity';

// NOTE: computed on demand for now; move to a scheduled precompute job when usage grows.
@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(UserGame)
    private readonly userGamesRepository: Repository<UserGame>,
    @InjectRepository(DiaryEntry)
    private readonly diaryRepository: Repository<DiaryEntry>,
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    @InjectRepository(Rating)
    private readonly ratingsRepository: Repository<Rating>,
  ) {}

  async overview(userId: string) {
    const totals = await this.userGamesRepository
      .createQueryBuilder('ug')
      .select('COUNT(*)', 'totalGames')
      .addSelect('COALESCE(SUM(ug.playtimeMinutes), 0)', 'totalPlaytimeMinutes')
      .addSelect(`COUNT(*) FILTER (WHERE ug.status = '${GameStatus.FINISHED}')`, 'finished')
      .addSelect(`COUNT(*) FILTER (WHERE ug.status = '${GameStatus.PLAYING}')`, 'playing')
      .addSelect(`COUNT(*) FILTER (WHERE ug.status = '${GameStatus.BACKLOG}')`, 'backlog')
      .addSelect(`COUNT(*) FILTER (WHERE ug.status = '${GameStatus.DROPPED}')`, 'dropped')
      .where('ug.userId = :userId', { userId })
      .getRawOne<{
        totalGames: string;
        totalPlaytimeMinutes: string;
        finished: string;
        playing: string;
        backlog: string;
        dropped: string;
      }>();

    const finished = Number(totals?.finished ?? 0);
    const playing = Number(totals?.playing ?? 0);
    const dropped = Number(totals?.dropped ?? 0);
    const started = finished + playing + dropped;

    const genreRows = await this.userGamesRepository.query<
      { genre: string; count: string; minutes: string }[]
    >(
      `SELECT unnest(g.genres) AS genre, COUNT(*) AS count, COALESCE(SUM(ug."playtimeMinutes"), 0) AS minutes
       FROM user_games ug
       JOIN games g ON g.id = ug."gameId"
       WHERE ug."userId" = $1
       GROUP BY 1
       ORDER BY minutes DESC, count DESC
       LIMIT 12`,
      [userId],
    );

    const platformRows = await this.userGamesRepository
      .createQueryBuilder('ug')
      .select('ug.platform', 'platform')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(ug.playtimeMinutes), 0)', 'minutes')
      .where('ug.userId = :userId', { userId })
      .groupBy('ug.platform')
      .getRawMany<{ platform: string; count: string; minutes: string }>();

    return {
      totalGames: Number(totals?.totalGames ?? 0),
      totalPlaytimeMinutes: Number(totals?.totalPlaytimeMinutes ?? 0),
      statusCounts: {
        finished,
        playing,
        backlog: Number(totals?.backlog ?? 0),
        dropped,
      },
      completionRate: started > 0 ? Number((finished / started).toFixed(3)) : null,
      genres: genreRows.map((r) => ({
        genre: r.genre,
        count: Number(r.count),
        minutes: Number(r.minutes),
      })),
      platforms: platformRows.map((r) => ({
        platform: r.platform,
        count: Number(r.count),
        minutes: Number(r.minutes),
      })),
    };
  }

  async wrapped(userId: string, year: number, month?: number) {
    const from = month ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1));
    const to = month ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year + 1, 0, 1));
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    // "Played in this period" comes from two real signals:
    //  1. Diary entries the user logged in the period.
    //  2. Steam's per-game last-played timestamp (rtime_last_played) captured on sync.
    // NOTE: Steam only exposes each game's LAST play date + TOTAL playtime, not per-session
    // history — so period playtime totals below are an approximation using total playtime.
    const diaryEntries = await this.diaryRepository
      .createQueryBuilder('entry')
      .where('entry.userId = :userId', { userId })
      .andWhere('entry.playedOn >= :fromStr AND entry.playedOn < :toStr', { fromStr, toStr })
      .getMany();

    const playedByLastPlayed = await this.userGamesRepository
      .createQueryBuilder('ug')
      .where('ug.userId = :userId', { userId })
      .andWhere('ug.lastPlayedAt >= :from AND ug.lastPlayedAt < :to', { from, to })
      .getMany();

    let gameIds = [
      ...new Set([
        ...diaryEntries.map((e) => e.gameId),
        ...playedByLastPlayed.map((ug) => ug.gameId),
      ]),
    ];
    let source: 'diary' | 'library' | 'all-time' =
      diaryEntries.length > 0 ? 'diary' : 'library';

    // Fallback so the recap is never empty: if this period has no play signal,
    // summarize the user's all-time most-played library instead.
    if (gameIds.length === 0) {
      const allTime = await this.userGamesRepository.find({
        where: { userId },
        select: { gameId: true },
      });
      gameIds = allTime.map((ug) => ug.gameId);
      source = 'all-time';
    }

    if (gameIds.length === 0) {
      return {
        year,
        month: month ?? null,
        source,
        totalGames: 0,
        totalMinutes: 0,
        topGames: [],
        topGenres: [],
        reviewCount: 0,
        ratingCount: 0,
      };
    }

    const rows = await this.userGamesRepository
      .createQueryBuilder('ug')
      .leftJoinAndSelect('ug.game', 'game')
      .where('ug.userId = :userId', { userId })
      .andWhere('ug.gameId IN (:...gameIds)', { gameIds })
      .orderBy('ug.playtimeMinutes', 'DESC')
      .getMany();

    const totalMinutes = rows.reduce((sum, row) => sum + row.playtimeMinutes, 0);
    const topGames = rows.slice(0, 5).map((row) => ({
      id: row.game.id,
      name: row.game.name,
      coverUrl: row.game.coverUrl,
      playtimeMinutes: row.playtimeMinutes,
    }));

    const genreCounts = new Map<string, number>();
    for (const row of rows) {
      for (const genre of row.game.genres ?? []) {
        genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
      }
    }
    const topGenres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre, count]) => ({ genre, count }));

    const [reviewCount, ratingCount] = await Promise.all([
      this.reviewsRepository.count({ where: { userId } }),
      this.ratingsRepository.count({ where: { userId } }),
    ]);

    return {
      year,
      month: month ?? null,
      source,
      totalGames: gameIds.length,
      totalMinutes,
      topGames,
      topGenres,
      reviewCount,
      ratingCount,
    };
  }
}
