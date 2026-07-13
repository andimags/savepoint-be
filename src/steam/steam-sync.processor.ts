import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Job, Queue } from "bullmq";
import { Repository } from "typeorm";
import {
    PlatformConnection,
    SyncStatus,
} from "../platform-connections/platform-connection.entity";
import { GamesService } from "../games/games.service";
import { UserGamesService } from "../user-games/user-games.service";
import { GamePlatform } from "../user-games/user-game.entity";
import { SteamApiService } from "./steam-api.service";

export interface SteamSyncJobData {
    connectionId: string;
    userId: string;
    steamId64: string;
}

@Processor("steam-sync")
export class SteamSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(SteamSyncProcessor.name);

    constructor(
        @InjectRepository(PlatformConnection)
        private readonly connectionsRepository: Repository<PlatformConnection>,
        private readonly steamApiService: SteamApiService,
        private readonly gamesService: GamesService,
        private readonly userGamesService: UserGamesService,
        @InjectQueue("rawg-enrich")
        private readonly rawgEnrichQueue: Queue,
    ) {
        super();
    }

    async process(job: Job<SteamSyncJobData>): Promise<void> {
        const { connectionId, userId, steamId64 } = job.data;

        await this.connectionsRepository.update(connectionId, {
            syncStatus: SyncStatus.SYNCING,
        });

        try {
            const ownedGames =
                await this.steamApiService.getOwnedGames(steamId64);

            for (const owned of ownedGames) {
                const coverUrl = SteamApiService.coverUrl(owned.appid);
                const game = await this.gamesService.upsertBySteamAppId(
                    owned.appid,
                    owned.name,
                    coverUrl,
                );
                const lastPlayedAt =
                    owned.rtime_last_played && owned.rtime_last_played > 0
                        ? new Date(owned.rtime_last_played * 1000)
                        : null;
                await this.userGamesService.upsert(
                    userId,
                    game.id,
                    GamePlatform.STEAM,
                    owned.playtime_forever,
                    lastPlayedAt,
                );
            }

            const syncError =
                ownedGames.length === 0
                    ? "No games found — the Steam profile may be private."
                    : null;
            await this.connectionsRepository.update(connectionId, {
                syncStatus: SyncStatus.DONE,
                syncError,
            });

            if (ownedGames.length > 0) {
                await this.rawgEnrichQueue.add("enrich", {});
            }
        } catch (error) {
            this.logger.error(
                `Steam sync failed for connection ${connectionId}`,
                error,
            );
            await this.connectionsRepository.update(connectionId, {
                syncStatus: SyncStatus.FAILED,
                syncError:
                    error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
}
