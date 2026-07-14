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
import { PsnApiService } from "./psn-api.service";

export interface PsnSyncJobData {
    connectionId: string;
    userId: string;
    refreshToken: string;
}

@Processor("psn-sync")
export class PsnSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(PsnSyncProcessor.name);

    constructor(
        @InjectRepository(PlatformConnection)
        private readonly connectionsRepository: Repository<PlatformConnection>,
        private readonly psnApiService: PsnApiService,
        private readonly gamesService: GamesService,
        private readonly userGamesService: UserGamesService,
        @InjectQueue("rawg-enrich")
        private readonly rawgEnrichQueue: Queue,
    ) {
        super();
    }

    async process(job: Job<PsnSyncJobData>): Promise<void> {
        const { connectionId, userId, refreshToken } = job.data;

        await this.connectionsRepository.update(connectionId, {
            syncStatus: SyncStatus.SYNCING,
        });

        try {
            const accessToken =
                await this.psnApiService.refreshAccessToken(refreshToken);
            const playedGames =
                await this.psnApiService.getPlayedGames(accessToken);

            for (const played of playedGames) {
                const game = await this.gamesService.upsertByPsnTitleId(
                    played.titleId,
                    played.name,
                    played.imageUrl,
                );
                await this.userGamesService.upsert(
                    userId,
                    game.id,
                    GamePlatform.PLAYSTATION,
                    played.playtimeMinutes,
                    played.lastPlayedAt,
                );
            }

            const syncError =
                playedGames.length === 0
                    ? "No games found — the PSN account may have no played titles or hidden game history."
                    : null;
            await this.connectionsRepository.update(connectionId, {
                syncStatus: SyncStatus.DONE,
                syncError,
            });

            if (playedGames.length > 0) {
                await this.rawgEnrichQueue.add("enrich", {});
            }
        } catch (error) {
            this.logger.error(
                `PSN sync failed for connection ${connectionId}`,
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
