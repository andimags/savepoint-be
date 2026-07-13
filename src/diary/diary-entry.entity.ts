import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { Game } from "../games/game.entity";
import { GameStatus } from "../user-games/user-game.entity";

@Entity("diary_entries")
@Index(["userId", "playedOn"])
export class DiaryEntry {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @Column()
    gameId: string;

    @ManyToOne(() => Game, { onDelete: "CASCADE" })
    @JoinColumn({ name: "gameId" })
    game: Game;

    @Column({ type: "date" })
    playedOn: string;

    @Column({ type: "varchar" })
    platform: string;

    @Column({ type: "enum", enum: GameStatus, nullable: true })
    status: GameStatus | null;

    @Column({ type: "text", nullable: true })
    note: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
