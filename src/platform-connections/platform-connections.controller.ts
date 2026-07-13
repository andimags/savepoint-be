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
import { ConnectSteamDto } from "./dto/connect-steam.dto";

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
}
