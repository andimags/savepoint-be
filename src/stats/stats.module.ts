import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserGame } from "../user-games/user-game.entity";
import { DiaryEntry } from "../diary/diary-entry.entity";
import { Review } from "../reviews/review.entity";
import { Rating } from "../ratings/rating.entity";
import { StatsService } from "./stats.service";
import { StatsController } from "./stats.controller";

@Module({
    imports: [TypeOrmModule.forFeature([UserGame, DiaryEntry, Review, Rating])],
    providers: [StatsService],
    controllers: [StatsController],
})
export class StatsModule {}
