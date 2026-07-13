import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformConnection } from './platform-connection.entity';
import { PlatformConnectionsService } from './platform-connections.service';
import { PlatformConnectionsController } from './platform-connections.controller';
import { SteamModule } from '../steam/steam.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformConnection]),
    BullModule.registerQueue({ name: 'steam-sync' }),
    SteamModule,
  ],
  providers: [PlatformConnectionsService],
  controllers: [PlatformConnectionsController],
})
export class PlatformConnectionsModule {}
