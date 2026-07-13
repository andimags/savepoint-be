import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783849206686 implements MigrationInterface {
    name = 'InitialSchema1783849206686'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "games" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "steamAppId" integer, "name" character varying NOT NULL, "coverUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_85d9b38710a727a020efe6ac63b" UNIQUE ("steamAppId"), CONSTRAINT "PK_c9b16b62917b5595af982d66337" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."platform_connections_platform_enum" AS ENUM('STEAM')`);
        await queryRunner.query(`CREATE TYPE "public"."platform_connections_syncstatus_enum" AS ENUM('pending', 'syncing', 'done', 'failed')`);
        await queryRunner.query(`CREATE TABLE "platform_connections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "platform" "public"."platform_connections_platform_enum" NOT NULL, "steamId64" character varying, "syncStatus" "public"."platform_connections_syncstatus_enum" NOT NULL DEFAULT 'pending', "syncError" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1dd6fa20ce53ecd8d03d5b86c17" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9293f2bae8c532b1b4a49363c3" ON "platform_connections"  ("userId", "platform") `);
        await queryRunner.query(`CREATE TYPE "public"."user_games_platform_enum" AS ENUM('STEAM')`);
        await queryRunner.query(`CREATE TYPE "public"."user_games_status_enum" AS ENUM('FINISHED', 'PLAYING', 'BACKLOG', 'DROPPED')`);
        await queryRunner.query(`CREATE TABLE "user_games" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "gameId" uuid NOT NULL, "platform" "public"."user_games_platform_enum" NOT NULL, "playtimeMinutes" integer NOT NULL DEFAULT '0', "status" "public"."user_games_status_enum", "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c9cc6a3afdc17ef440abea3b055" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d8bd125c804ea85057773e6bb4" ON "user_games"  ("userId", "gameId", "platform") `);
        await queryRunner.query(`ALTER TABLE "platform_connections" ADD CONSTRAINT "FK_2fc9b5a2c5f13b761fc90abc45c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_games" ADD CONSTRAINT "FK_f32a18072dfcadc634dd2fd266b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_games" ADD CONSTRAINT "FK_1f35a6273ebc0cb50d852d07c5a" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_games" DROP CONSTRAINT "FK_1f35a6273ebc0cb50d852d07c5a"`);
        await queryRunner.query(`ALTER TABLE "user_games" DROP CONSTRAINT "FK_f32a18072dfcadc634dd2fd266b"`);
        await queryRunner.query(`ALTER TABLE "platform_connections" DROP CONSTRAINT "FK_2fc9b5a2c5f13b761fc90abc45c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d8bd125c804ea85057773e6bb4"`);
        await queryRunner.query(`DROP TABLE "user_games"`);
        await queryRunner.query(`DROP TYPE "public"."user_games_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_games_platform_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9293f2bae8c532b1b4a49363c3"`);
        await queryRunner.query(`DROP TABLE "platform_connections"`);
        await queryRunner.query(`DROP TYPE "public"."platform_connections_syncstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."platform_connections_platform_enum"`);
        await queryRunner.query(`DROP TABLE "games"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
