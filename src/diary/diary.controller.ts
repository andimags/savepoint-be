import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Request,
    UseGuards,
} from "@nestjs/common";
import {
    IsDateString,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DiaryService } from "./diary.service";

type Req = { user: { userId: string } };

class CreateDiaryEntryDto {
    @IsUUID()
    gameId: string;

    @IsDateString()
    playedOn: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(60)
    platform: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string;
}

class UpdateDiaryEntryDto {
    @IsOptional()
    @IsDateString()
    playedOn?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(60)
    platform?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string;
}

@UseGuards(JwtAuthGuard)
@Controller("diary")
export class DiaryController {
    constructor(private readonly diaryService: DiaryService) {}

    @Post()
    create(@Request() req: Req, @Body() dto: CreateDiaryEntryDto) {
        return this.diaryService.create(req.user.userId, dto);
    }

    @Get()
    findAll(
        @Request() req: Req,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
        return this.diaryService.findPaginated(
            req.user.userId,
            pageNum,
            limitNum,
        );
    }

    @Patch(":id")
    update(
        @Request() req: Req,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdateDiaryEntryDto,
    ) {
        return this.diaryService.update(req.user.userId, id, dto);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete(":id")
    async remove(@Request() req: Req, @Param("id", ParseUUIDPipe) id: string) {
        await this.diaryService.remove(req.user.userId, id);
    }
}
