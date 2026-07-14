import { MigrationInterface, QueryRunner } from "typeorm";

export class RemovePlatformUsernameVisibility1783913000000
    implements MigrationInterface
{
    name = "RemovePlatformUsernameVisibility1783913000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "showPsnUsername"`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "showSteamUsername"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" ADD "showSteamUsername" boolean NOT NULL DEFAULT true`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD "showPsnUsername" boolean NOT NULL DEFAULT true`,
        );
    }
}
