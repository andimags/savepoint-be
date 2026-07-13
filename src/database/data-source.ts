import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Game } from '../games/game.entity';
import { PlatformConnection } from '../platform-connections/platform-connection.entity';
import { UserGame } from '../user-games/user-game.entity';
import { Rating } from '../ratings/rating.entity';
import { Review } from '../reviews/review.entity';
import { ReviewLike } from '../reviews/review-like.entity';
import { ReviewComment } from '../reviews/review-comment.entity';
import { List } from '../lists/list.entity';
import { ListItem } from '../lists/list-item.entity';
import { Follow } from '../social/follow.entity';
import { DiaryEntry } from '../diary/diary-entry.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
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
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
