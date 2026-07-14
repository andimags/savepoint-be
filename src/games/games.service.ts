import {
    Injectable,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Queue } from "bullmq";
import { ILike, In, IsNull, Not, Repository } from "typeorm";
import { Game } from "./game.entity";
import { RawgApiService, RawgGame } from "../rawg/rawg-api.service";

@Injectable()
export class GamesService implements OnApplicationBootstrap {
    private readonly logger = new Logger(GamesService.name);

    constructor(
        @InjectRepository(Game)
        private readonly gamesRepository: Repository<Game>,
        private readonly rawgApiService: RawgApiService,
        @InjectQueue("rawg-enrich")
        private readonly rawgEnrichQueue: Queue,
    ) {}

    /** Backfill genres/art for any games left unenriched (e.g. synced before the RAWG key was set). */
    async onApplicationBootstrap(): Promise<void> {
        if (!this.rawgApiService.isConfigured) return;
        const pending = await this.countMissingRawgData();
        if (pending > 0) {
            this.logger.log(
                `Queuing RAWG enrichment for ${pending} unenriched games`,
            );
            await this.enqueueEnrichment();
        }
    }

    async enqueueEnrichment(): Promise<void> {
        await this.rawgEnrichQueue.add("enrich", {});
    }

    async upsertBySteamAppId(
        steamAppId: number,
        name: string,
        coverUrl: string | null,
    ): Promise<Game> {
        const existing = await this.gamesRepository.findOne({
            where: { steamAppId },
        });
        if (existing) {
            existing.name = name;
            // Prefer RAWG artwork when present; Steam icons are tiny
            if (!existing.rawgId) existing.coverUrl = coverUrl;
            return this.gamesRepository.save(existing);
        }
        const game = this.gamesRepository.create({
            steamAppId,
            name,
            coverUrl,
        });
        return this.gamesRepository.save(game);
    }

    async upsertByPsnTitleId(
        psnTitleId: string,
        name: string,
        coverUrl: string | null,
    ): Promise<Game> {
        const existing = await this.gamesRepository.findOne({
            where: { psnTitleId },
        });
        if (existing) {
            existing.name = name;
            // Prefer RAWG artwork when present; PSN icons are lower-res
            if (!existing.rawgId) existing.coverUrl = coverUrl;
            return this.gamesRepository.save(existing);
        }
        const game = this.gamesRepository.create({
            psnTitleId,
            name,
            coverUrl,
        });
        return this.gamesRepository.save(game);
    }

    async upsertFromRawg(rawgGame: RawgGame): Promise<Game> {
        let game = await this.gamesRepository.findOne({
            where: { rawgId: rawgGame.id },
        });
        if (!game) {
            // Merge with a Steam-imported row of the same name instead of duplicating
            game = await this.gamesRepository.findOne({
                where: { name: rawgGame.name, rawgId: IsNull() },
            });
        }
        if (!game) {
            game = this.gamesRepository.create({ name: rawgGame.name });
        }

        game.rawgId = rawgGame.id;
        game.slug = rawgGame.slug;
        game.name = rawgGame.name;
        game.coverUrl = rawgGame.background_image ?? game.coverUrl;
        game.genres = rawgGame.genres?.map((g) => g.name) ?? game.genres ?? [];
        game.releaseDate = rawgGame.released ?? game.releaseDate;
        game.metacritic = rawgGame.metacritic ?? game.metacritic;
        if (rawgGame.description_raw) {
            game.description = rawgGame.description_raw;
        }
        game.rawgEnrichedAt = new Date();
        return this.gamesRepository.save(game);
    }

    async search(query: string): Promise<Game[]> {
        const local = await this.gamesRepository.find({
            where: { name: ILike(`%${query}%`) },
            take: 20,
            order: { name: "ASC" },
        });

        if (!this.rawgApiService.isConfigured) {
            return local;
        }

        try {
            const rawgResults = await this.rawgApiService.searchGames(query);
            const merged = new Map<string, Game>();
            for (const game of local) {
                merged.set(game.id, game);
            }
            for (const rawgGame of rawgResults) {
                const game = await this.upsertFromRawg(rawgGame);
                merged.set(game.id, game);
            }
            return [...merged.values()];
        } catch {
            // RAWG being down shouldn't break search — serve the local cache
            return local;
        }
    }

    /** Popular games for the browse view; caches RAWG results locally, falls back to cache. */
    async browse(): Promise<Game[]> {
        if (this.rawgApiService.isConfigured) {
            try {
                const popular = await this.rawgApiService.getPopularGames(24);
                const games: Game[] = [];
                for (const rawgGame of popular) {
                    games.push(await this.upsertFromRawg(rawgGame));
                }
                if (games.length > 0) return games;
            } catch {
                // fall through to local cache
            }
        }
        return this.gamesRepository.find({
            where: { rawgId: Not(IsNull()) },
            order: { metacritic: "DESC" },
            take: 24,
        });
    }

    async getById(id: string): Promise<Game> {
        const game = await this.gamesRepository.findOne({ where: { id } });
        if (!game) {
            throw new NotFoundException("Game not found");
        }
        // Enrich with full details on first view
        if (
            game.rawgId &&
            !game.description &&
            this.rawgApiService.isConfigured
        ) {
            try {
                const details = await this.rawgApiService.getGame(game.rawgId);
                if (details) return this.upsertFromRawg(details);
            } catch {
                // serve what we have
            }
        }
        return game;
    }

    async findMissingRawgData(limit: number): Promise<Game[]> {
        return this.gamesRepository.find({
            where: { rawgId: IsNull(), rawgEnrichedAt: IsNull() },
            take: limit,
        });
    }

    async markEnrichmentAttempted(gameId: string): Promise<void> {
        await this.gamesRepository.update(gameId, {
            rawgEnrichedAt: new Date(),
        });
    }

    /**
     * Apply RAWG data onto an existing local game (identified by the enrichment job),
     * rather than looking it up by name/rawgId — the local name (e.g. a Steam title) often
     * differs from RAWG's canonical name, so a lookup would spawn a duplicate row.
     */
    async enrichGame(game: Game, rawgGame: RawgGame): Promise<Game> {
        // If a prior run already created a separate row for this rawgId, remove it to free the unique slot.
        // Only drop pure name-placeholder rows — never one anchored to a real store id (Steam or PSN).
        const duplicate = await this.gamesRepository.findOne({
            where: { rawgId: rawgGame.id },
        });
        if (
            duplicate &&
            duplicate.id !== game.id &&
            !duplicate.steamAppId &&
            !duplicate.psnTitleId
        ) {
            await this.gamesRepository.delete(duplicate.id);
        }

        game.rawgId = rawgGame.id;
        game.slug = rawgGame.slug;
        game.coverUrl = rawgGame.background_image ?? game.coverUrl;
        game.genres = rawgGame.genres?.map((g) => g.name) ?? [];
        game.releaseDate = rawgGame.released ?? game.releaseDate;
        game.metacritic = rawgGame.metacritic ?? game.metacritic;
        if (rawgGame.description_raw)
            game.description = rawgGame.description_raw;
        game.rawgEnrichedAt = new Date();
        return this.gamesRepository.save(game);
    }

    countMissingRawgData(): Promise<number> {
        return this.gamesRepository.count({
            where: { rawgId: IsNull(), rawgEnrichedAt: IsNull() },
        });
    }

    findByIds(ids: string[]): Promise<Game[]> {
        if (ids.length === 0) return Promise.resolve([]);
        return this.gamesRepository.find({ where: { id: In(ids) } });
    }
}
