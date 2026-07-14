import { MigrationInterface, QueryRunner } from "typeorm";

export class SetUserGameStatusDefault1783909000000
    implements MigrationInterface
{
    name = "SetUserGameStatusDefault1783909000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "user_games" SET "status" = 'BACKLOG' WHERE "status" IS NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_games" ALTER COLUMN "status" SET DEFAULT 'BACKLOG'`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_games" ALTER COLUMN "status" SET NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "user_games" ALTER COLUMN "status" DROP NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_games" ALTER COLUMN "status" DROP DEFAULT`,
        );
    }
}
