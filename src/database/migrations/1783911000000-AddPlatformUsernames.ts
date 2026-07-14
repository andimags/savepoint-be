import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlatformUsernames1783911000000 implements MigrationInterface {
    name = "AddPlatformUsernames1783911000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" ADD "steamUsername" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD "psnUsername" character varying`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "psnUsername"`);
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "steamUsername"`,
        );
    }
}
