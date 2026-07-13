import { MigrationInterface, QueryRunner } from "typeorm";

export class ExpandPlatformEnum1783853068479 implements MigrationInterface {
    name = "ExpandPlatformEnum1783853068479";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."IDX_9293f2bae8c532b1b4a49363c3"`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."platform_connections_platform_enum" ADD VALUE 'PS5'`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."platform_connections_platform_enum" ADD VALUE 'STEAM_DECK'`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."platform_connections_platform_enum" ADD VALUE 'PC'`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."platform_connections_platform_enum" ADD VALUE 'OTHER'`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_d8bd125c804ea85057773e6bb4"`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."user_games_platform_enum" ADD VALUE 'PS5'`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."user_games_platform_enum" ADD VALUE 'STEAM_DECK'`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."user_games_platform_enum" ADD VALUE 'PC'`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."user_games_platform_enum" ADD VALUE 'OTHER'`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9293f2bae8c532b1b4a49363c3" ON "platform_connections"  ("userId", "platform") `,
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
            `DROP INDEX "public"."IDX_9293f2bae8c532b1b4a49363c3"`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."user_games_platform_enum_old" AS ENUM('STEAM')`,
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
            `CREATE TYPE "public"."platform_connections_platform_enum_old" AS ENUM('STEAM')`,
        );
        await queryRunner.query(
            `ALTER TABLE "platform_connections" ALTER COLUMN "platform" TYPE "public"."platform_connections_platform_enum_old" USING "platform"::"text"::"public"."platform_connections_platform_enum_old"`,
        );
        await queryRunner.query(
            `DROP TYPE "public"."platform_connections_platform_enum"`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."platform_connections_platform_enum_old" RENAME TO "platform_connections_platform_enum"`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9293f2bae8c532b1b4a49363c3" ON "platform_connections" USING btree ("userId", "platform") `,
        );
    }
}
