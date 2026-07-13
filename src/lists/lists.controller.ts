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
    Request,
    UseGuards,
} from "@nestjs/common";
import {
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ListsService } from "./lists.service";

type Req = { user: { userId: string } };

class ListDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;
}

class AddItemDto {
    @IsUUID()
    gameId: string;
}

@UseGuards(JwtAuthGuard)
@Controller("lists")
export class ListsController {
    constructor(private readonly listsService: ListsService) {}

    @Post()
    create(@Request() req: Req, @Body() dto: ListDto) {
        return this.listsService.create(
            req.user.userId,
            dto.title,
            dto.description ?? null,
        );
    }

    @Get("mine")
    mine(@Request() req: Req) {
        return this.listsService.findByUser(req.user.userId);
    }

    @Get("user/:userId")
    byUser(@Param("userId", ParseUUIDPipe) userId: string) {
        return this.listsService.findByUser(userId);
    }

    @Get(":id")
    findOne(@Param("id", ParseUUIDPipe) id: string) {
        return this.listsService.findOne(id);
    }

    @Patch(":id")
    update(
        @Request() req: Req,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: ListDto,
    ) {
        return this.listsService.update(
            req.user.userId,
            id,
            dto.title,
            dto.description ?? null,
        );
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete(":id")
    async remove(@Request() req: Req, @Param("id", ParseUUIDPipe) id: string) {
        await this.listsService.remove(req.user.userId, id);
    }

    @Post(":id/items")
    addItem(
        @Request() req: Req,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: AddItemDto,
    ) {
        return this.listsService.addItem(req.user.userId, id, dto.gameId);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete(":id/items/:itemId")
    async removeItem(
        @Request() req: Req,
        @Param("id", ParseUUIDPipe) id: string,
        @Param("itemId", ParseUUIDPipe) itemId: string,
    ) {
        await this.listsService.removeItem(req.user.userId, id, itemId);
    }
}
