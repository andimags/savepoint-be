import { INestApplication, ValidationPipe } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import { App } from "supertest/types";
import { DataSource, Repository } from "typeorm";

import { AuthModule } from "../src/auth/auth.module";
import { UsersModule } from "../src/users/users.module";
import { User } from "../src/users/user.entity";
import { GamesModule } from "../src/games/games.module";
import { Game } from "../src/games/game.entity";

// Isolated from dev data: its own Postgres database and its own Redis logical
// db, so nothing this suite does touches the real dev queue or dev rows.
const TEST_DATABASE_URL =
    "postgres://savepoint:savepoint@localhost:5433/savepoint_test_games";
const TEST_REDIS_URL = "redis://localhost:6380/2";

interface AuthResponseBody {
    accessToken: string;
}

describe("Games (e2e)", () => {
    let app: INestApplication<App>;
    let gamesRepository: Repository<Game>;
    let dataSource: DataSource;
    let accessToken: string;
    let seededGame: Game;

    beforeAll(async () => {
        process.env.DATABASE_URL = TEST_DATABASE_URL;
        process.env.REDIS_URL = TEST_REDIS_URL;
        process.env.JWT_SECRET ??= "test-secret";
        // Set (not deleted) so ConfigModule.forRoot()'s .env load can't refill it —
        // this suite must never make real RAWG network calls.
        process.env.RAWG_API_KEY = "";

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                TypeOrmModule.forRoot({
                    type: "postgres",
                    url: TEST_DATABASE_URL,
                    entities: [User, Game],
                    synchronize: true,
                    dropSchema: true,
                }),
                BullModule.forRoot({ connection: { url: TEST_REDIS_URL } }),
                AuthModule,
                UsersModule,
                GamesModule,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        gamesRepository = moduleFixture.get(getRepositoryToken(Game));
        dataSource = moduleFixture.get(DataSource);

        const registerResponse = await request(app.getHttpServer())
            .post("/auth/register")
            .send({
                email: "player@example.com",
                username: "player_one",
                password: "password123",
            });
        ({ accessToken } = registerResponse.body as AuthResponseBody);

        seededGame = await gamesRepository.save(
            gamesRepository.create({
                name: "Test Quest",
                rawgId: 999,
                metacritic: 80,
            }),
        );
    });

    afterAll(async () => {
        await dataSource.dropDatabase();
        await app.close();
    });

    describe("GET /games/search", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer())
                .get("/games/search")
                .query({ q: "quest" })
                .expect(401);
        });

        it("rejects a missing query with 400", async () => {
            await request(app.getHttpServer())
                .get("/games/search")
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(400);
        });

        it("rejects a blank query with 400", async () => {
            await request(app.getHttpServer())
                .get("/games/search")
                .query({ q: "   " })
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(400);
        });

        it("returns games matching the query", async () => {
            const response = await request(app.getHttpServer())
                .get("/games/search")
                .query({ q: "Quest" })
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: seededGame.id, name: "Test Quest" }),
                ]),
            );
        });
    });

    describe("GET /games/browse", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer()).get("/games/browse").expect(401);
        });

        it("returns enriched games from the local cache", async () => {
            const response = await request(app.getHttpServer())
                .get("/games/browse")
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: seededGame.id }),
                ]),
            );
        });
    });

    describe("GET /games/:id", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer())
                .get(`/games/${seededGame.id}`)
                .expect(401);
        });

        it("rejects a non-UUID id with 400", async () => {
            await request(app.getHttpServer())
                .get("/games/not-a-uuid")
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(400);
        });

        it("returns 404 for a well-formed id that does not exist", async () => {
            await request(app.getHttpServer())
                .get("/games/00000000-0000-0000-0000-000000000000")
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(404);
        });

        it("returns the game for a known id", async () => {
            const response = await request(app.getHttpServer())
                .get(`/games/${seededGame.id}`)
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.objectContaining({ id: seededGame.id, name: "Test Quest" }),
            );
        });
    });

    describe("POST /games/enrich", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer()).post("/games/enrich").expect(401);
        });

        it("queues an enrichment job and returns 202", async () => {
            const response = await request(app.getHttpServer())
                .post("/games/enrich")
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(202);

            expect(response.body).toEqual({ queued: true });
        });
    });
});
