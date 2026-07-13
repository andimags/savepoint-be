import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomFavorites1783907786629 implements MigrationInterface {
    name = 'AddCustomFavorites1783907786629'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "topGameIds" uuid array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "favoriteGenres" text array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "topFranchise" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "topFranchise"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "favoriteGenres"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "topGameIds"`);
    }

}
