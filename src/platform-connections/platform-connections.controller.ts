import {
    Body,
    Controller,
    Get,
    Post,
    Request,
    UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PlatformConnectionsService } from "./platform-connections.service";
import { PlatformConnection } from "./platform-connection.entity";
import { ConnectSteamDto } from "./dto/connect-steam.dto";
import { ConnectPsnDto } from "./dto/connect-psn.dto";

@UseGuards(JwtAuthGuard)
@Controller("platform-connections")
export class PlatformConnectionsController {
    constructor(
        private readonly platformConnectionsService: PlatformConnectionsService,
    ) {}

    @Post("steam")
    connectSteam(
        @Request() req: { user: { userId: string } },
        @Body() dto: ConnectSteamDto,
    ) {
        return this.platformConnectionsService.connectSteam(
            req.user.userId,
            dto.profileUrlOrId,
        );
    }

    @Post("steam/resync")
    resync(@Request() req: { user: { userId: string } }) {
        return this.platformConnectionsService.resync(req.user.userId);
    }

    @Get("steam/status")
    async status(@Request() req: { user: { userId: string } }) {
        const connection = await this.platformConnectionsService.getStatus(
            req.user.userId,
        );
        if (!connection) {
            return { connected: false };
        }
        return {
            connected: true,
            steamId64: connection.steamId64,
            syncStatus: connection.syncStatus,
            syncError: connection.syncError,
        };
    }

    @Post("psn")
    async connectPsn(
        @Request() req: { user: { userId: string } },
        @Body() dto: ConnectPsnDto,
    ) {
        const connection = await this.platformConnectionsService.connectPsn(
            req.user.userId,
            dto.npsso,
        );
        return this.toPsnStatus(connection);
    }

    @Post("psn/resync")
    async resyncPsn(@Request() req: { user: { userId: string } }) {
        const connection = await this.platformConnectionsService.resyncPsn(
            req.user.userId,
        );
        return this.toPsnStatus(connection);
    }

    @Get("psn/status")
    async psnStatus(@Request() req: { user: { userId: string } }) {
        const connection = await this.platformConnectionsService.getPsnStatus(
            req.user.userId,
        );
        if (!connection) {
            return { connected: false };
        }
        return this.toPsnStatus(connection);
    }

    /**
     * Shape a PSN connection for the client. Intentionally omits psnRefreshToken —
     * it's a secret and must never leave the server.
     */
    private toPsnStatus(connection: PlatformConnection) {
        return {
            connected: true,
            onlineId: connection.psnOnlineId,
            syncStatus: connection.syncStatus,
            syncError: connection.syncError,
        };
    }
}
