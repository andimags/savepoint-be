import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from '../games/game.entity';
import { UserGame } from '../user-games/user-game.entity';
import { Rating } from '../ratings/rating.entity';
import { GamesModule } from '../games/games.module';
import { RawgModule } from '../rawg/rawg.module';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Game, UserGame, Rating]),
    GamesModule,
    RawgModule,
  ],
  providers: [RecommendationsService],
  controllers: [RecommendationsController],
})
export class RecommendationsModule {}
