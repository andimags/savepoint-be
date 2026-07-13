import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Put,
    Request,
    UseGuards,
} from "@nestjs/common";
import { IsInt, Max, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RatingsService } from "./ratings.service";

class RateDto {
    @IsInt()
    @Min(1)
    @Max(5)
    value: number;
}

@UseGuards(JwtAuthGuard)
@Controller("games/:gameId/rating")
export class RatingsController {
    constructor(private readonly ratingsService: RatingsService) {}

    @Get()
    summary(
        @Request() req: { user: { userId: string } },
        @Param("gameId", ParseUUIDPipe) gameId: string,
    ) {
        return this.ratingsService.summary(gameId, req.user.userId);
    }

    @Put()
    rate(
        @Request() req: { user: { userId: string } },
        @Param("gameId", ParseUUIDPipe) gameId: string,
        @Body() dto: RateDto,
    ) {
        return this.ratingsService.upsert(req.user.userId, gameId, dto.value);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete()
    async remove(
        @Request() req: { user: { userId: string } },
        @Param("gameId", ParseUUIDPipe) gameId: string,
    ) {
        await this.ratingsService.remove(req.user.userId, gameId);
    }
}
