import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformConnection } from '../platform-connections/platform-connection.entity';
import { GamesModule } from '../games/games.module';
import { UserGamesModule } from '../user-games/user-games.module';
import { SteamApiService } from './steam-api.service';
import { SteamSyncProcessor } from './steam-sync.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformConnection]),
    BullModule.registerQueue({ name: 'steam-sync' }),
    GamesModule,
    UserGamesModule,
  ],
  providers: [SteamApiService, SteamSyncProcessor],
  exports: [SteamApiService, BullModule],
})
export class SteamModule {}
