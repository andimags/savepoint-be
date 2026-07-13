import { MigrationInterface, QueryRunner } from "typeorm";

export class FullSpecSchema1783852139006 implements MigrationInterface {
    name = "FullSpecSchema1783852139006";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "ratings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "gameId" uuid NOT NULL, "value" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0f31425b073219379545ad68ed9" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9f5de0087cc30e4df86272d528" ON "ratings"  ("userId", "gameId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "gameId" uuid NOT NULL, "body" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_26039ba0e1bdcf71aa58ce4c60" ON "reviews"  ("gameId", "createdAt") `,
        );
        await queryRunner.query(
            `CREATE TABLE "review_likes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "reviewId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_927159e047aee5a52998ad31577" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_66b73fb28dc2cf83784b4089b9" ON "review_likes"  ("userId", "reviewId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "review_comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "reviewId" uuid NOT NULL, "body" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7a18556c348d381630855d05f0a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_37259c8f6022406a0496151c12" ON "review_comments"  ("reviewId", "createdAt") `,
        );
        await queryRunner.query(
            `CREATE TABLE "list_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "listId" uuid NOT NULL, "gameId" uuid NOT NULL, "position" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_26260957b2b71a1d8e2ecd005f8" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_65b2931cee608b3525d973e483" ON "list_items"  ("listId", "gameId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "lists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "title" character varying NOT NULL, "description" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_268b525e9a6dd04d0685cb2aaaa" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "follows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "followerId" uuid NOT NULL, "followingId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_e304c9a4ada5815ab376bedfec" CHECK ("followerId" <> "followingId"), CONSTRAINT "PK_8988f607744e16ff79da3b8a627" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_105079775692df1f8799ed0fac" ON "follows"  ("followerId", "followingId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "diary_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "gameId" uuid NOT NULL, "playedOn" date NOT NULL, "platform" character varying NOT NULL, "note" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_45cc0613be17fab8a954db677a0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_f97aab29890e5b880c1c276dc2" ON "diary_entries"  ("userId", "playedOn") `,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD "username" character varying`,
        );
        // Backfill existing accounts from their email prefix, de-duplicated with a numeric suffix
        await queryRunner.query(`
            UPDATE "users" u SET "username" = sub.candidate || CASE WHEN sub.rn = 1 THEN '' ELSE sub.rn::text END
            FROM (
                SELECT id,
                       regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g') AS candidate,
                       row_number() OVER (PARTITION BY regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g') ORDER BY "createdAt") AS rn
                FROM "users"
            ) sub
            WHERE u.id = sub.id
        `);
        await queryRunner.query(
            `ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username")`,
        );
        await queryRunner.query(`ALTER TABLE "games" ADD "rawgId" integer`);
        await queryRunner.query(
            `ALTER TABLE "games" ADD CONSTRAINT "UQ_da93272507e293c9326b2e0b9d5" UNIQUE ("rawgId")`,
        );
        await queryRunner.query(
            `ALTER TABLE "games" ADD "slug" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "games" ADD "genres" text array NOT NULL DEFAULT '{}'`,
        );
        await queryRunner.query(`ALTER TABLE "games" ADD "releaseDate" date`);
        await queryRunner.query(`ALTER TABLE "games" ADD "metacritic" integer`);
        await queryRunner.query(`ALTER TABLE "games" ADD "description" text`);
        await queryRunner.query(
            `ALTER TABLE "ratings" ADD CONSTRAINT "FK_4d0b0e3a4c4af854d225154ba40" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "ratings" ADD CONSTRAINT "FK_f907fdcb40336dd928571fb2e08" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "reviews" ADD CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "reviews" ADD CONSTRAINT "FK_b1fad171e95a3e00bd06bbbbf79" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "review_likes" ADD CONSTRAINT "FK_0d688be5d7def42d685de4d2c74" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "review_likes" ADD CONSTRAINT "FK_9860c907f782adb487acfb2a539" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "review_comments" ADD CONSTRAINT "FK_803011311b44532ee5715447980" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "review_comments" ADD CONSTRAINT "FK_f7eb91a4c1d977a9b468e10ca55" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "list_items" ADD CONSTRAINT "FK_e5e7afb4b205ba2cea879d77fc3" FOREIGN KEY ("listId") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "list_items" ADD CONSTRAINT "FK_adebdba97a59fc0fb870fa63e0c" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "lists" ADD CONSTRAINT "FK_d13ad3f1ae1abae672c3edbef90" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "follows" ADD CONSTRAINT "FK_fdb91868b03a2040db408a53331" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "follows" ADD CONSTRAINT "FK_ef463dd9a2ce0d673350e36e0fb" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "diary_entries" ADD CONSTRAINT "FK_c8a2d9f5fb78615e2dbb28a3cd0" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "diary_entries" ADD CONSTRAINT "FK_df5efa8c7b0f719fd8ef85988b0" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "diary_entries" DROP CONSTRAINT "FK_df5efa8c7b0f719fd8ef85988b0"`,
        );
        await queryRunner.query(
            `ALTER TABLE "diary_entries" DROP CONSTRAINT "FK_c8a2d9f5fb78615e2dbb28a3cd0"`,
        );
        await queryRunner.query(
            `ALTER TABLE "follows" DROP CONSTRAINT "FK_ef463dd9a2ce0d673350e36e0fb"`,
        );
        await queryRunner.query(
            `ALTER TABLE "follows" DROP CONSTRAINT "FK_fdb91868b03a2040db408a53331"`,
        );
        await queryRunner.query(
            `ALTER TABLE "lists" DROP CONSTRAINT "FK_d13ad3f1ae1abae672c3edbef90"`,
        );
        await queryRunner.query(
            `ALTER TABLE "list_items" DROP CONSTRAINT "FK_adebdba97a59fc0fb870fa63e0c"`,
        );
        await queryRunner.query(
            `ALTER TABLE "list_items" DROP CONSTRAINT "FK_e5e7afb4b205ba2cea879d77fc3"`,
        );
        await queryRunner.query(
            `ALTER TABLE "review_comments" DROP CONSTRAINT "FK_f7eb91a4c1d977a9b468e10ca55"`,
        );
        await queryRunner.query(
            `ALTER TABLE "review_comments" DROP CONSTRAINT "FK_803011311b44532ee5715447980"`,
        );
        await queryRunner.query(
            `ALTER TABLE "review_likes" DROP CONSTRAINT "FK_9860c907f782adb487acfb2a539"`,
        );
        await queryRunner.query(
            `ALTER TABLE "review_likes" DROP CONSTRAINT "FK_0d688be5d7def42d685de4d2c74"`,
        );
        await queryRunner.query(
            `ALTER TABLE "reviews" DROP CONSTRAINT "FK_b1fad171e95a3e00bd06bbbbf79"`,
        );
        await queryRunner.query(
            `ALTER TABLE "reviews" DROP CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f"`,
        );
        await queryRunner.query(
            `ALTER TABLE "ratings" DROP CONSTRAINT "FK_f907fdcb40336dd928571fb2e08"`,
        );
        await queryRunner.query(
            `ALTER TABLE "ratings" DROP CONSTRAINT "FK_4d0b0e3a4c4af854d225154ba40"`,
        );
        await queryRunner.query(
            `ALTER TABLE "games" DROP COLUMN "description"`,
        );
        await queryRunner.query(`ALTER TABLE "games" DROP COLUMN "metacritic"`);
        await queryRunner.query(
            `ALTER TABLE "games" DROP COLUMN "releaseDate"`,
        );
        await queryRunner.query(`ALTER TABLE "games" DROP COLUMN "genres"`);
        await queryRunner.query(`ALTER TABLE "games" DROP COLUMN "slug"`);
        await queryRunner.query(
            `ALTER TABLE "games" DROP CONSTRAINT "UQ_da93272507e293c9326b2e0b9d5"`,
        );
        await queryRunner.query(`ALTER TABLE "games" DROP COLUMN "rawgId"`);
        await queryRunner.query(
            `ALTER TABLE "users" DROP CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710"`,
        );
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_f97aab29890e5b880c1c276dc2"`,
        );
        await queryRunner.query(`DROP TABLE "diary_entries"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_105079775692df1f8799ed0fac"`,
        );
        await queryRunner.query(`DROP TABLE "follows"`);
        await queryRunner.query(`DROP TABLE "lists"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_65b2931cee608b3525d973e483"`,
        );
        await queryRunner.query(`DROP TABLE "list_items"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_37259c8f6022406a0496151c12"`,
        );
        await queryRunner.query(`DROP TABLE "review_comments"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_66b73fb28dc2cf83784b4089b9"`,
        );
        await queryRunner.query(`DROP TABLE "review_likes"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_26039ba0e1bdcf71aa58ce4c60"`,
        );
        await queryRunner.query(`DROP TABLE "reviews"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_9f5de0087cc30e4df86272d528"`,
        );
        await queryRunner.query(`DROP TABLE "ratings"`);
    }
}
