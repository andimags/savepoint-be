import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from "typeorm";

@Entity("users")
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    email: string;

    @Column({ unique: true })
    username: string;

    @Column({ type: "varchar", nullable: true })
    displayName: string | null;

    @Column({ type: "varchar", nullable: true })
    avatarUrl: string | null;

    @Column({ type: "uuid", nullable: true })
    favoriteGameId: string | null;

    // User-curated favorites (override the auto-computed stats when set)
    @Column({ type: "uuid", array: true, default: "{}" })
    topGameIds: string[];

    @Column({ type: "text", array: true, default: "{}" })
    favoriteGenres: string[];

    @Column({ type: "varchar", nullable: true })
    topFranchise: string | null;

    @Column()
    passwordHash: string;

    @CreateDateColumn()
    createdAt: Date;
}
