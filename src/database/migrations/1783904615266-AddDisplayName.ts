import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDisplayName1783904615266 implements MigrationInterface {
    name = 'AddDisplayName1783904615266'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "displayName" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "displayName"`);
    }

}
