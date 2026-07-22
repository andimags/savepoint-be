import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import { App } from "supertest/types";
import { DataSource, Repository } from "typeorm";

import { AuthModule } from "../src/auth/auth.module";
import { UsersModule } from "../src/users/users.module";
import { User } from "../src/users/user.entity";
import { Game } from "../src/games/game.entity";
import { ListsModule } from "../src/lists/lists.module";
import { List } from "../src/lists/list.entity";
import { ListItem } from "../src/lists/list-item.entity";

// Isolated from dev data: its own disposable Postgres database.
const TEST_DATABASE_URL =
    "postgres://savepoint:savepoint@localhost:5433/savepoint_test_lists";

interface AuthResponseBody {
    accessToken: string;
    user: { id: string };
}

describe("Lists (e2e)", () => {
    let app: INestApplication<App>;
    let gamesRepository: Repository<Game>;
    let dataSource: DataSource;
    let ownerToken: string;
    let ownerId: string;
    let otherToken: string;
    let seededGame: Game;
    let listId: string;
    let itemId: string;

    beforeAll(async () => {
        process.env.DATABASE_URL = TEST_DATABASE_URL;
        process.env.JWT_SECRET ??= "test-secret";

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                TypeOrmModule.forRoot({
                    type: "postgres",
                    url: TEST_DATABASE_URL,
                    entities: [User, Game, List, ListItem],
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature([Game]),
                AuthModule,
                UsersModule,
                ListsModule,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        gamesRepository = moduleFixture.get(getRepositoryToken(Game));
        dataSource = moduleFixture.get(DataSource);

        const ownerResponse = await request(app.getHttpServer())
            .post("/auth/register")
            .send({
                email: "owner@example.com",
                username: "list_owner",
                password: "password123",
            });
        const ownerBody = ownerResponse.body as AuthResponseBody;
        ownerToken = ownerBody.accessToken;
        ownerId = ownerBody.user.id;

        const otherResponse = await request(app.getHttpServer())
            .post("/auth/register")
            .send({
                email: "other@example.com",
                username: "someone_else",
                password: "password123",
            });
        otherToken = (otherResponse.body as AuthResponseBody).accessToken;

        seededGame = await gamesRepository.save(
            gamesRepository.create({ name: "Test Quest" }),
        );
    });

    afterAll(async () => {
        await dataSource.dropDatabase();
        await app.close();
    });

    describe("POST /lists", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer())
                .post("/lists")
                .send({ title: "Favorites" })
                .expect(401);
        });

        it("rejects a missing title with 400", async () => {
            await request(app.getHttpServer())
                .post("/lists")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({})
                .expect(400);
        });

        it("rejects a title over 120 characters with 400", async () => {
            await request(app.getHttpServer())
                .post("/lists")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ title: "x".repeat(121) })
                .expect(400);
        });

        it("creates a list for the authenticated user", async () => {
            const response = await request(app.getHttpServer())
                .post("/lists")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ title: "Favorites", description: "My favorite games" })
                .expect(201);

            expect(response.body).toEqual(
                expect.objectContaining({
                    title: "Favorites",
                    description: "My favorite games",
                    userId: ownerId,
                }),
            );
            listId = (response.body as { id: string }).id;
        });
    });

    describe("GET /lists/mine", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer()).get("/lists/mine").expect(401);
        });

        it("returns the caller's lists with item counts", async () => {
            const response = await request(app.getHttpServer())
                .get("/lists/mine")
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: listId, itemCount: 0 }),
                ]),
            );
        });
    });

    describe("GET /lists/:id", () => {
        it("returns 400 for a non-UUID id", async () => {
            await request(app.getHttpServer())
                .get("/lists/not-a-uuid")
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(400);
        });

        it("returns 404 for a well-formed id that does not exist", async () => {
            await request(app.getHttpServer())
                .get("/lists/00000000-0000-0000-0000-000000000000")
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(404);
        });

        it("returns the list shape with owner info and items", async () => {
            const response = await request(app.getHttpServer())
                .get(`/lists/${listId}`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.objectContaining({
                    id: listId,
                    title: "Favorites",
                    owner: { id: ownerId, username: "list_owner" },
                    items: [],
                }),
            );
        });
    });

    describe("PATCH /lists/:id", () => {
        it("rejects an update from a non-owner with 403", async () => {
            await request(app.getHttpServer())
                .patch(`/lists/${listId}`)
                .set("Authorization", `Bearer ${otherToken}`)
                .send({ title: "Hijacked" })
                .expect(403);
        });

        it("updates the list for its owner", async () => {
            const response = await request(app.getHttpServer())
                .patch(`/lists/${listId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ title: "Updated Favorites" })
                .expect(200);

            expect(response.body).toEqual(
                expect.objectContaining({ title: "Updated Favorites" }),
            );
        });
    });

    describe("POST /lists/:id/items", () => {
        it("rejects a non-UUID gameId with 400", async () => {
            await request(app.getHttpServer())
                .post(`/lists/${listId}/items`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ gameId: "not-a-uuid" })
                .expect(400);
        });

        it("rejects adding an item from a non-owner with 403", async () => {
            await request(app.getHttpServer())
                .post(`/lists/${listId}/items`)
                .set("Authorization", `Bearer ${otherToken}`)
                .send({ gameId: seededGame.id })
                .expect(403);
        });

        it("adds the item for the list's owner", async () => {
            const response = await request(app.getHttpServer())
                .post(`/lists/${listId}/items`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ gameId: seededGame.id })
                .expect(201);

            expect(response.body).toEqual(
                expect.objectContaining({
                    listId,
                    gameId: seededGame.id,
                    position: 0,
                }),
            );
            itemId = (response.body as { id: string }).id;
        });

        it("returns the existing item instead of duplicating it", async () => {
            const response = await request(app.getHttpServer())
                .post(`/lists/${listId}/items`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ gameId: seededGame.id })
                .expect(201);

            expect((response.body as { id: string }).id).toBe(itemId);
        });

        it("reflects the added item in the list's item count", async () => {
            const response = await request(app.getHttpServer())
                .get("/lists/mine")
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: listId, itemCount: 1 }),
                ]),
            );
        });
    });

    describe("DELETE /lists/:id/items/:itemId", () => {
        it("rejects removal from a non-owner with 403", async () => {
            await request(app.getHttpServer())
                .delete(`/lists/${listId}/items/${itemId}`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(403);
        });

        it("removes the item for the list's owner", async () => {
            await request(app.getHttpServer())
                .delete(`/lists/${listId}/items/${itemId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(204);

            const response = await request(app.getHttpServer())
                .get(`/lists/${listId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(200);

            expect((response.body as { items: unknown[] }).items).toEqual([]);
        });
    });

    describe("DELETE /lists/:id", () => {
        it("rejects deletion from a non-owner with 403", async () => {
            await request(app.getHttpServer())
                .delete(`/lists/${listId}`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(403);
        });

        it("deletes the list for its owner", async () => {
            await request(app.getHttpServer())
                .delete(`/lists/${listId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(204);

            await request(app.getHttpServer())
                .get(`/lists/${listId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(404);
        });
    });
});
