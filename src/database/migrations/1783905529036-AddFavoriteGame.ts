import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFavoriteGame1783905529036 implements MigrationInterface {
    name = "AddFavoriteGame1783905529036";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" ADD "favoriteGameId" uuid`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "favoriteGameId"`,
        );
    }
}
