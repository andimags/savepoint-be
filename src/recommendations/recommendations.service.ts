import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from '../games/game.entity';
import { UserGame } from '../user-games/user-game.entity';
import { Rating } from '../ratings/rating.entity';
import { GamesService } from '../games/games.service';
import { RawgApiService } from '../rawg/rawg-api.service';

const RESULT_SIZE = 12;

// Genre/tag-overlap scoring per the spec — no ML, just weighted intersection.
@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(Game)
    private readonly gamesRepository: Repository<Game>,
    @InjectRepository(UserGame)
    private readonly userGamesRepository: Repository<UserGame>,
    @InjectRepository(Rating)
    private readonly ratingsRepository: Repository<Rating>,
    private readonly gamesService: GamesService,
    private readonly rawgApiService: RawgApiService,
  ) {}

  async forUser(userId: string) {
    const seedGames = await this.getSeedGames(userId);
    if (seedGames.length === 0) return [];

    const genreWeights = new Map<string, number>();
    for (const game of seedGames) {
      for (const genre of game.genres ?? []) {
        genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + 1);
      }
    }
    if (genreWeights.size === 0) return [];

    const owned = await this.userGamesRepository.find({ where: { userId } });
    const ownedIds = new Set(owned.map((ug) => ug.gameId));

    let candidates = await this.scoreLocalCandidates(genreWeights, ownedIds);

    // Top up from RAWG when the local cache is thin
    if (candidates.length < RESULT_SIZE && this.rawgApiService.isConfigured) {
      const topGenres = [...genreWeights.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([genre]) => genre.toLowerCase().replace(/\s+/g, '-'));
      try {
        const rawgGames = await this.rawgApiService.getGamesByGenres(topGenres);
        for (const rawgGame of rawgGames) {
          await this.gamesService.upsertFromRawg(rawgGame);
        }
        candidates = await this.scoreLocalCandidates(genreWeights, ownedIds);
      } catch {
        // recommendations from local cache only
      }
    }

    return candidates.slice(0, RESULT_SIZE);
  }

  private async getSeedGames(userId: string): Promise<Game[]> {
    const highRatings = await this.ratingsRepository.find({
      where: { userId },
      relations: { game: true },
    });
    const loved = highRatings.filter((r) => r.value >= 4).map((r) => r.game);
    if (loved.length > 0) return loved;

    // Fallback: most-played games
    const mostPlayed = await this.userGamesRepository.find({
      where: { userId },
      relations: { game: true },
      order: { playtimeMinutes: 'DESC' },
      take: 10,
    });
    return mostPlayed.filter((ug) => ug.playtimeMinutes > 0).map((ug) => ug.game);
  }

  private async scoreLocalCandidates(genreWeights: Map<string, number>, ownedIds: Set<string>) {
    const genres = [...genreWeights.keys()];
    const rows = await this.gamesRepository
      .createQueryBuilder('game')
      .where('game.genres && ARRAY[:...genres]::text[]', { genres })
      .getMany();

    return rows
      .filter((game) => !ownedIds.has(game.id))
      .map((game) => {
        const score = (game.genres ?? []).reduce(
          (sum, genre) => sum + (genreWeights.get(genre) ?? 0),
          0,
        );
        return { game, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ game, score }) => ({
        id: game.id,
        name: game.name,
        coverUrl: game.coverUrl,
        genres: game.genres,
        releaseDate: game.releaseDate,
        metacritic: game.metacritic,
        score,
      }));
  }
}
