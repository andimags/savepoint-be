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

export enum Platform {
    STEAM = "STEAM",
    PS5 = "PS5",
    STEAM_DECK = "STEAM_DECK",
    PC = "PC",
    OTHER = "OTHER",
}

export enum SyncStatus {
    PENDING = "pending",
    SYNCING = "syncing",
    DONE = "done",
    FAILED = "failed",
}

@Entity("platform_connections")
@Index(["userId", "platform"], { unique: true })
export class PlatformConnection {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @Column({ type: "enum", enum: Platform })
    platform: Platform;

    @Column({ type: "varchar", nullable: true })
    steamId64: string | null;

    @Column({ type: "enum", enum: SyncStatus, default: SyncStatus.PENDING })
    syncStatus: SyncStatus;

    @Column({ type: "varchar", nullable: true })
    syncError: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
