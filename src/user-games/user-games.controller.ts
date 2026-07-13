import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Request,
    UseGuards,
} from "@nestjs/common";
import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UserGamesService } from "./user-games.service";
import { GamePlatform, GameStatus } from "./user-game.entity";

type Req = { user: { userId: string } };

class UpdateUserGameDto {
    // Optional so callers can update status and platform independently. A null status
    // clears it; an omitted field leaves the current value untouched.
    @IsOptional()
    @IsEnum(GameStatus)
    status?: GameStatus | null;

    @IsOptional()
    @IsEnum(GamePlatform)
    platform?: GamePlatform;
}

class AddManualDto {
    @IsUUID()
    gameId: string;

    @IsEnum(GamePlatform)
    platform: GamePlatform;

    @IsOptional()
    @IsEnum(GameStatus)
    status?: GameStatus;
}

@UseGuards(JwtAuthGuard)
@Controller("user-games")
export class UserGamesController {
    constructor(private readonly userGamesService: UserGamesService) {}

    @Get()
    findAll(
        @Request() req: Req,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
        @Query("status") status?: string,
        @Query("gameId") gameId?: string,
        @Query("userId") userId?: string,
    ) {
        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
        const statusFilter =
            status && Object.values(GameStatus).includes(status as GameStatus)
                ? (status as GameStatus)
                : undefined;
        // Any authenticated user can view another user's library (read-only).
        const targetUserId = userId ?? req.user.userId;
        return this.userGamesService.findPaginated(
            targetUserId,
            pageNum,
            limitNum,
            statusFilter,
            gameId,
        );
    }

    @Post()
    addManual(@Request() req: Req, @Body() dto: AddManualDto) {
        // Backlog is the default status for a newly added library game.
        return this.userGamesService.addManual(
            req.user.userId,
            dto.gameId,
            dto.platform,
            dto.status ?? GameStatus.BACKLOG,
        );
    }

    @Patch(":id")
    update(
        @Request() req: Req,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserGameDto,
    ) {
        return this.userGamesService.update(req.user.userId, id, dto);
    }

    @Delete(":id")
    @HttpCode(204)
    remove(@Request() req: Req, @Param("id", ParseUUIDPipe) id: string) {
        return this.userGamesService.remove(req.user.userId, id);
    }
}
