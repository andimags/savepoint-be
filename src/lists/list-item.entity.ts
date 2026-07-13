import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Game } from '../games/game.entity';
import { List } from './list.entity';

@Entity('list_items')
@Index(['listId', 'gameId'], { unique: true })
export class ListItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  listId: string;

  @ManyToOne(() => List, (list) => list.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listId' })
  list: List;

  @Column()
  gameId: string;

  @ManyToOne(() => Game, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gameId' })
  game: Game;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
