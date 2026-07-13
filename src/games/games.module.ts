import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from './game.entity';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { RawgModule } from '../rawg/rawg.module';
import { RawgEnrichProcessor } from '../rawg/rawg-enrich.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Game]),
    BullModule.registerQueue({ name: 'rawg-enrich' }),
    RawgModule,
  ],
  providers: [GamesService, RawgEnrichProcessor],
  controllers: [GamesController],
  exports: [GamesService, BullModule],
})
export class GamesModule {}
