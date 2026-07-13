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

export enum GameStatus {
    FINISHED = "FINISHED",
    PLAYING = "PLAYING",
    BACKLOG = "BACKLOG",
    DROPPED = "DROPPED",
}

export enum GamePlatform {
    STEAM = "STEAM",
    GOG = "GOG",
    EPIC = "EPIC",
    XBOX = "XBOX",
    PLAYSTATION = "PLAYSTATION",
    NINTENDO = "NINTENDO",
    OTHER = "OTHER",
}

@Entity("user_games")
@Index(["userId", "gameId", "platform"], { unique: true })
export class UserGame {
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

    @Column({ type: "enum", enum: GamePlatform })
    platform: GamePlatform;

    @Column({ type: "int", default: 0 })
    playtimeMinutes: number;

    @Column({ type: "enum", enum: GameStatus, nullable: true })
    status: GameStatus | null;

    @Column({ type: "timestamp", nullable: true })
    lastPlayedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
