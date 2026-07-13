import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserGame } from "./user-game.entity";
import { UserGamesService } from "./user-games.service";
import { UserGamesController } from "./user-games.controller";
import { DiaryModule } from "../diary/diary.module";

@Module({
    imports: [TypeOrmModule.forFeature([UserGame]), DiaryModule],
    providers: [UserGamesService],
    controllers: [UserGamesController],
    exports: [UserGamesService],
})
export class UserGamesModule {}
