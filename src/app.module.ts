import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { User } from "./users/user.entity";
import { Game } from "./games/game.entity";
import { PlatformConnection } from "./platform-connections/platform-connection.entity";
import { UserGame } from "./user-games/user-game.entity";
import { Rating } from "./ratings/rating.entity";
import { Review } from "./reviews/review.entity";
import { ReviewLike } from "./reviews/review-like.entity";
import { ReviewComment } from "./reviews/review-comment.entity";
import { List } from "./lists/list.entity";
import { ListItem } from "./lists/list-item.entity";
import { Follow } from "./social/follow.entity";
import { DiaryEntry } from "./diary/diary-entry.entity";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { GamesModule } from "./games/games.module";
import { PlatformConnectionsModule } from "./platform-connections/platform-connections.module";
import { SteamModule } from "./steam/steam.module";
import { PsnModule } from "./psn/psn.module";
import { UserGamesModule } from "./user-games/user-games.module";
import { RatingsModule } from "./ratings/ratings.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { ListsModule } from "./lists/lists.module";
import { DiaryModule } from "./diary/diary.module";
import { SocialModule } from "./social/social.module";
import { StatsModule } from "./stats/stats.module";
import { RecommendationsModule } from "./recommendations/recommendations.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: "postgres",
                url: configService.getOrThrow<string>("DATABASE_URL"),
                entities: [
                    User,
                    Game,
                    PlatformConnection,
                    UserGame,
                    Rating,
                    Review,
                    ReviewLike,
                    ReviewComment,
                    List,
                    ListItem,
                    Follow,
                    DiaryEntry,
                ],
                synchronize: false,
            }),
        }),
        BullModule.forRootAsync({
            imports: [ConfigModule],
            /* put services that will be used in the factory function --------------------------------------- */
            inject: [ConfigService],
            /* useFactory returns the config args when initializing BullModule ------------------------------ */
            useFactory: (configService: ConfigService) => ({
                connection: {
                    url: configService.getOrThrow<string>("REDIS_URL"),
                },
            }),
        }),
        UsersModule,
        AuthModule,
        GamesModule,
        SteamModule,
        PsnModule,
        PlatformConnectionsModule,
        UserGamesModule,
        RatingsModule,
        ReviewsModule,
        ListsModule,
        DiaryModule,
        SocialModule,
        StatsModule,
        RecommendationsModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
