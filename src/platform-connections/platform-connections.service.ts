import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Queue } from "bullmq";
import { Repository } from "typeorm";
import {
    PlatformConnection,
    Platform,
    SyncStatus,
} from "./platform-connection.entity";
import { SteamApiService } from "../steam/steam-api.service";
import type { SteamSyncJobData } from "../steam/steam-sync.processor";
import { PsnApiService } from "../psn/psn-api.service";
import type { PsnSyncJobData } from "../psn/psn-sync.processor";

@Injectable()
export class PlatformConnectionsService {
    constructor(
        @InjectRepository(PlatformConnection)
        private readonly connectionsRepository: Repository<PlatformConnection>,
        @InjectQueue("steam-sync")
        private readonly steamSyncQueue: Queue<SteamSyncJobData>,
        @InjectQueue("psn-sync")
        private readonly psnSyncQueue: Queue<PsnSyncJobData>,
        private readonly steamApiService: SteamApiService,
        private readonly psnApiService: PsnApiService,
    ) {}

    async connectSteam(
        userId: string,
        profileUrlOrId: string,
    ): Promise<PlatformConnection> {
        const steamId64 =
            await this.steamApiService.resolveToSteamId64(profileUrlOrId);

        let connection = await this.connectionsRepository.findOne({
            where: { userId, platform: Platform.STEAM },
        });

        if (connection) {
            connection.steamId64 = steamId64;
            connection.syncStatus = SyncStatus.PENDING;
            connection.syncError = null;
        } else {
            connection = this.connectionsRepository.create({
                userId,
                platform: Platform.STEAM,
                steamId64,
                syncStatus: SyncStatus.PENDING,
            });
        }
        connection = await this.connectionsRepository.save(connection);

        await this.enqueueSync(connection);
        return connection;
    }

    async resync(userId: string): Promise<PlatformConnection> {
        const connection = await this.connectionsRepository.findOne({
            where: { userId, platform: Platform.STEAM },
        });
        if (!connection || !connection.steamId64) {
            throw new BadRequestException(
                "No Steam connection found for this user",
            );
        }
        connection.syncStatus = SyncStatus.PENDING;
        connection.syncError = null;
        await this.connectionsRepository.save(connection);
        await this.enqueueSync(connection);
        return connection;
    }

    getStatus(userId: string): Promise<PlatformConnection | null> {
        return this.connectionsRepository.findOne({
            where: { userId, platform: Platform.STEAM },
        });
    }

    async connectPsn(
        userId: string,
        npsso: string,
    ): Promise<PlatformConnection> {
        const auth = await this.psnApiService.authenticateWithNpsso(npsso);

        let connection = await this.connectionsRepository.findOne({
            where: { userId, platform: Platform.PSN },
        });

        if (connection) {
            connection.psnRefreshToken = auth.refreshToken;
            connection.psnAccountId = auth.accountId;
            connection.psnOnlineId = auth.onlineId;
            connection.syncStatus = SyncStatus.PENDING;
            connection.syncError = null;
        } else {
            connection = this.connectionsRepository.create({
                userId,
                platform: Platform.PSN,
                psnRefreshToken: auth.refreshToken,
                psnAccountId: auth.accountId,
                psnOnlineId: auth.onlineId,
                syncStatus: SyncStatus.PENDING,
            });
        }
        connection = await this.connectionsRepository.save(connection);

        await this.enqueuePsnSync(connection);
        return connection;
    }

    async resyncPsn(userId: string): Promise<PlatformConnection> {
        const connection = await this.connectionsRepository.findOne({
            where: { userId, platform: Platform.PSN },
        });
        if (!connection || !connection.psnRefreshToken) {
            throw new BadRequestException(
                "No PlayStation connection found for this user",
            );
        }
        connection.syncStatus = SyncStatus.PENDING;
        connection.syncError = null;
        await this.connectionsRepository.save(connection);
        await this.enqueuePsnSync(connection);
        return connection;
    }

    getPsnStatus(userId: string): Promise<PlatformConnection | null> {
        return this.connectionsRepository.findOne({
            where: { userId, platform: Platform.PSN },
        });
    }

    private async enqueueSync(connection: PlatformConnection): Promise<void> {
        await this.steamSyncQueue.add("sync", {
            connectionId: connection.id,
            userId: connection.userId,
            steamId64: connection.steamId64 as string,
        });
    }

    private async enqueuePsnSync(
        connection: PlatformConnection,
    ): Promise<void> {
        await this.psnSyncQueue.add("sync", {
            connectionId: connection.id,
            userId: connection.userId,
            refreshToken: connection.psnRefreshToken as string,
        });
    }
}
