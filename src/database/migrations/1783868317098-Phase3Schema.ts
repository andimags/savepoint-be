import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase3Schema1783868317098 implements MigrationInterface {
    name = "Phase3Schema1783868317098";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "user_games" ADD "lastPlayedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."diary_entries_status_enum" AS ENUM('FINISHED', 'PLAYING', 'BACKLOG', 'DROPPED')`,
        );
        await queryRunner.query(
            `ALTER TABLE "diary_entries" ADD "status" "public"."diary_entries_status_enum"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_d8bd125c804ea85057773e6bb4"`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."user_games_platform_enum" RENAME TO "user_games_platform_enum_old"`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."user_games_platform_enum" AS ENUM('STEAM', 'GOG', 'EPIC', 'XBOX', 'PLAYSTATION', 'NINTENDO', 'OTHER')`,
        );
        // Remap retired platform values to the new GamePlatform enum before casting
        await queryRunner.query(`ALTER TABLE "user_games" ALTER COLUMN "platform" TYPE "public"."user_games_platform_enum" USING (
            CASE "platform"::"text"
                WHEN 'PS5' THEN 'PLAYSTATION'
                WHEN 'STEAM_DECK' THEN 'STEAM'
                WHEN 'PC' THEN 'OTHER'
                ELSE "platform"::"text"
            END
        )::"public"."user_games_platform_enum"`);
        await queryRunner.query(
            `DROP TYPE "public"."user_games_platform_enum_old"`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_d8bd125c804ea85057773e6bb4" ON "user_games"  ("userId", "gameId", "platform") `,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."IDX_d8bd125c804ea85057773e6bb4"`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."user_games_platform_enum_old" AS ENUM('STEAM', 'PS5', 'STEAM_DECK', 'PC', 'OTHER')`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_games" ALTER COLUMN "platform" TYPE "public"."user_games_platform_enum_old" USING "platform"::"text"::"public"."user_games_platform_enum_old"`,
        );
        await queryRunner.query(
            `DROP TYPE "public"."user_games_platform_enum"`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."user_games_platform_enum_old" RENAME TO "user_games_platform_enum"`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_d8bd125c804ea85057773e6bb4" ON "user_games" USING btree ("userId", "gameId", "platform") `,
        );
        await queryRunner.query(
            `ALTER TABLE "diary_entries" DROP COLUMN "status"`,
        );
        await queryRunner.query(
            `DROP TYPE "public"."diary_entries_status_enum"`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_games" DROP COLUMN "lastPlayedAt"`,
        );
    }
}
