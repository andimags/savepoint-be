import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from "typeorm";

@Entity("games")
export class Game {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "int", unique: true, nullable: true })
    steamAppId: number | null;

    // PSN title id (e.g. "CUSA01433_00"); identifies the exact version played, mirrors steamAppId.
    @Column({ type: "varchar", unique: true, nullable: true })
    psnTitleId: string | null;

    @Column({ type: "int", unique: true, nullable: true })
    rawgId: number | null;

    @Column()
    name: string;

    @Column({ type: "varchar", nullable: true })
    slug: string | null;

    @Column({ type: "varchar", nullable: true })
    coverUrl: string | null;

    @Column({ type: "text", array: true, default: "{}" })
    genres: string[];

    @Column({ type: "date", nullable: true })
    releaseDate: string | null;

    @Column({ type: "int", nullable: true })
    metacritic: number | null;

    @Column({ type: "text", nullable: true })
    description: string | null;

    // Set once RAWG enrichment has been attempted, so unmatched games aren't re-queried forever.
    @Column({ type: "timestamp", nullable: true })
    rawgEnrichedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;
}
