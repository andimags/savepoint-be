import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Follow } from "./follow.entity";
import { User } from "../users/user.entity";
import { Game } from "../games/game.entity";
import { UserGame } from "../user-games/user-game.entity";
import { PlatformConnection } from "../platform-connections/platform-connection.entity";
import { SocialService } from "./social.service";
import { SocialController } from "./social.controller";
import { ReviewsModule } from "../reviews/reviews.module";
import { DiaryModule } from "../diary/diary.module";
import { ListsModule } from "../lists/lists.module";

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Follow,
            User,
            Game,
            UserGame,
            PlatformConnection,
        ]),
        ReviewsModule,
        DiaryModule,
        ListsModule,
    ],
    providers: [SocialService],
    controllers: [SocialController],
    exports: [SocialService],
})
export class SocialModule {}
