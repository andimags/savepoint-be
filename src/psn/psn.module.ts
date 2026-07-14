import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PlatformConnection } from "../platform-connections/platform-connection.entity";
import { GamesModule } from "../games/games.module";
import { UserGamesModule } from "../user-games/user-games.module";
import { PsnApiService } from "./psn-api.service";
import { PsnSyncProcessor } from "./psn-sync.processor";

@Module({
    imports: [
        TypeOrmModule.forFeature([PlatformConnection]),
        BullModule.registerQueue({ name: "psn-sync" }),
        GamesModule,
        UserGamesModule,
    ],
    providers: [PsnApiService, PsnSyncProcessor],
    exports: [PsnApiService, BullModule],
})
export class PsnModule {}
