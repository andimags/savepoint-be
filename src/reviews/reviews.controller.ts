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
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ReviewsService } from "./reviews.service";
import { CommentBodyDto, ReviewBodyDto } from "./dto/review.dto";

type Req = { user: { userId: string } };

function clampPage(page?: string) {
    return Math.max(1, Number(page) || 1);
}
function clampLimit(limit?: string) {
    return Math.min(50, Math.max(1, Number(limit) || 10));
}

@UseGuards(JwtAuthGuard)
@Controller()
export class ReviewsController {
    constructor(private readonly reviewsService: ReviewsService) {}

    @Post("games/:gameId/reviews")
    create(
        @Request() req: Req,
        @Param("gameId", ParseUUIDPipe) gameId: string,
        @Body() dto: ReviewBodyDto,
    ) {
        return this.reviewsService.create(req.user.userId, gameId, dto.body);
    }

    @Get("games/:gameId/reviews")
    forGame(
        @Request() req: Req,
        @Param("gameId", ParseUUIDPipe) gameId: string,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        return this.reviewsService.findForGame(
            gameId,
            req.user.userId,
            clampPage(page),
            clampLimit(limit),
        );
    }

    @Get("reviews/recent")
    recent(
        @Request() req: Req,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        return this.reviewsService.findRecent(
            req.user.userId,
            clampPage(page),
            clampLimit(limit),
        );
    }

    @Get("users/:userId/reviews")
    byUser(
        @Request() req: Req,
        @Param("userId", ParseUUIDPipe) userId: string,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        return this.reviewsService.findByUser(
            userId,
            req.user.userId,
            clampPage(page),
            clampLimit(limit),
        );
    }

    @Patch("reviews/:id")
    update(
        @Request() req: Req,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: ReviewBodyDto,
    ) {
        return this.reviewsService.update(req.user.userId, id, dto.body);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete("reviews/:id")
    async remove(@Request() req: Req, @Param("id", ParseUUIDPipe) id: string) {
        await this.reviewsService.remove(req.user.userId, id);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("reviews/:id/like")
    async like(@Request() req: Req, @Param("id", ParseUUIDPipe) id: string) {
        await this.reviewsService.like(req.user.userId, id);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete("reviews/:id/like")
    async unlike(@Request() req: Req, @Param("id", ParseUUIDPipe) id: string) {
        await this.reviewsService.unlike(req.user.userId, id);
    }

    @Post("reviews/:id/comments")
    addComment(
        @Request() req: Req,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: CommentBodyDto,
    ) {
        return this.reviewsService.addComment(req.user.userId, id, dto.body);
    }

    @Get("reviews/:id/comments")
    comments(
        @Param("id", ParseUUIDPipe) id: string,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        return this.reviewsService.findComments(
            id,
            clampPage(page),
            clampLimit(limit),
        );
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete("comments/:id")
    async removeComment(
        @Request() req: Req,
        @Param("id", ParseUUIDPipe) id: string,
    ) {
        await this.reviewsService.removeComment(req.user.userId, id);
    }
}
