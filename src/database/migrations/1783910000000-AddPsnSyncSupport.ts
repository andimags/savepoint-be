import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPsnSyncSupport1783910000000 implements MigrationInterface {
    name = "AddPsnSyncSupport1783910000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "games" ADD "psnTitleId" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "games" ADD CONSTRAINT "UQ_games_psnTitleId" UNIQUE ("psnTitleId")`,
        );
        await queryRunner.query(
            `ALTER TABLE "platform_connections" ADD "psnRefreshToken" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "platform_connections" ADD "psnAccountId" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "platform_connections" ADD "psnOnlineId" character varying`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."platform_connections_platform_enum" ADD VALUE IF NOT EXISTS 'PSN'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "platform_connections" DROP COLUMN "psnOnlineId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "platform_connections" DROP COLUMN "psnAccountId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "platform_connections" DROP COLUMN "psnRefreshToken"`,
        );
        await queryRunner.query(
            `ALTER TABLE "games" DROP CONSTRAINT "UQ_games_psnTitleId"`,
        );
        await queryRunner.query(`ALTER TABLE "games" DROP COLUMN "psnTitleId"`);

        // Postgres cannot drop a single enum value, so rebuild the type without 'PSN'.
        await queryRunner.query(
            `ALTER TYPE "public"."platform_connections_platform_enum" RENAME TO "platform_connections_platform_enum_old"`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."platform_connections_platform_enum" AS ENUM('STEAM', 'PS5', 'STEAM_DECK', 'PC', 'OTHER')`,
        );
        await queryRunner.query(
            `ALTER TABLE "platform_connections" ALTER COLUMN "platform" TYPE "public"."platform_connections_platform_enum" USING "platform"::"text"::"public"."platform_connections_platform_enum"`,
        );
        await queryRunner.query(
            `DROP TYPE "public"."platform_connections_platform_enum_old"`,
        );
    }
}
