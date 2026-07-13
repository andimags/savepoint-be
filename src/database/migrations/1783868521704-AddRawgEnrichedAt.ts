import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRawgEnrichedAt1783868521704 implements MigrationInterface {
    name = "AddRawgEnrichedAt1783868521704";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "games" ADD "rawgEnrichedAt" TIMESTAMP`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "games" DROP COLUMN "rawgEnrichedAt"`,
        );
    }
}
