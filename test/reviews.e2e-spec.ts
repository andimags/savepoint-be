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
import { ReviewsModule } from "../src/reviews/reviews.module";
import { Review } from "../src/reviews/review.entity";
import { ReviewLike } from "../src/reviews/review-like.entity";
import { ReviewComment } from "../src/reviews/review-comment.entity";
import { Rating } from "../src/ratings/rating.entity";

// Isolated from dev data: its own disposable Postgres database.
const TEST_DATABASE_URL =
    "postgres://savepoint:savepoint@localhost:5433/savepoint_test_reviews";

interface AuthResponseBody {
    accessToken: string;
    user: { id: string };
}

describe("Reviews (e2e)", () => {
    let app: INestApplication<App>;
    let gamesRepository: Repository<Game>;
    let dataSource: DataSource;
    let authorToken: string;
    let authorId: string;
    let otherToken: string;
    let seededGame: Game;
    let reviewId: string;
    let commentId: string;

    beforeAll(async () => {
        process.env.DATABASE_URL = TEST_DATABASE_URL;
        process.env.JWT_SECRET ??= "test-secret";

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                TypeOrmModule.forRoot({
                    type: "postgres",
                    url: TEST_DATABASE_URL,
                    entities: [User, Game, Review, ReviewLike, ReviewComment, Rating],
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature([Game]),
                AuthModule,
                UsersModule,
                ReviewsModule,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        gamesRepository = moduleFixture.get(getRepositoryToken(Game));
        dataSource = moduleFixture.get(DataSource);

        const authorResponse = await request(app.getHttpServer())
            .post("/auth/register")
            .send({
                email: "author@example.com",
                username: "review_author",
                password: "password123",
            });
        const authorBody = authorResponse.body as AuthResponseBody;
        authorToken = authorBody.accessToken;
        authorId = authorBody.user.id;

        const otherResponse = await request(app.getHttpServer())
            .post("/auth/register")
            .send({
                email: "reader@example.com",
                username: "reader_one",
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

    describe("POST /games/:gameId/reviews", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer())
                .post(`/games/${seededGame.id}/reviews`)
                .send({ body: "Great game!" })
                .expect(401);
        });

        it("rejects an empty body with 400", async () => {
            await request(app.getHttpServer())
                .post(`/games/${seededGame.id}/reviews`)
                .set("Authorization", `Bearer ${authorToken}`)
                .send({ body: "" })
                .expect(400);
        });

        it("rejects a non-UUID gameId with 400", async () => {
            await request(app.getHttpServer())
                .post("/games/not-a-uuid/reviews")
                .set("Authorization", `Bearer ${authorToken}`)
                .send({ body: "Great game!" })
                .expect(400);
        });

        it("creates a review for the authenticated user", async () => {
            const response = await request(app.getHttpServer())
                .post(`/games/${seededGame.id}/reviews`)
                .set("Authorization", `Bearer ${authorToken}`)
                .send({ body: "Great game!" })
                .expect(201);

            expect(response.body).toEqual(
                expect.objectContaining({
                    userId: authorId,
                    gameId: seededGame.id,
                    body: "Great game!",
                }),
            );
            reviewId = (response.body as { id: string }).id;
        });
    });

    describe("GET /games/:gameId/reviews", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer())
                .get(`/games/${seededGame.id}/reviews`)
                .expect(401);
        });

        it("returns the paginated review feed without an embedded game field", async () => {
            const response = await request(app.getHttpServer())
                .get(`/games/${seededGame.id}/reviews`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(200);

            const body = response.body as {
                items: { game?: unknown }[];
            };
            expect(body.items[0].game).toBeUndefined();
            expect(response.body).toEqual(
                expect.objectContaining({
                    total: 1,
                    page: 1,
                    limit: 10,
                    totalPages: 1,
                    items: [
                        expect.objectContaining({
                            id: reviewId,
                            body: "Great game!",
                            author: { id: authorId, username: "review_author" },
                            rating: null,
                            likeCount: 0,
                            likedByMe: false,
                            commentCount: 0,
                        }),
                    ],
                }),
            );
        });
    });

    describe("GET /reviews/recent", () => {
        it("includes the embedded game field", async () => {
            const response = await request(app.getHttpServer())
                .get("/reviews/recent")
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.objectContaining({
                    items: expect.arrayContaining([
                        expect.objectContaining({
                            id: reviewId,
                            game: {
                                id: seededGame.id,
                                name: seededGame.name,
                                coverUrl: seededGame.coverUrl,
                            },
                        }),
                    ]) as unknown[],
                }),
            );
        });
    });

    describe("GET /users/:userId/reviews", () => {
        it("returns the given user's reviews", async () => {
            const response = await request(app.getHttpServer())
                .get(`/users/${authorId}/reviews`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.objectContaining({
                    items: expect.arrayContaining([
                        expect.objectContaining({ id: reviewId }),
                    ]) as unknown[],
                }),
            );
        });
    });

    describe("PATCH /reviews/:id", () => {
        it("rejects an update from a non-owner with 403", async () => {
            await request(app.getHttpServer())
                .patch(`/reviews/${reviewId}`)
                .set("Authorization", `Bearer ${otherToken}`)
                .send({ body: "Hijacked" })
                .expect(403);
        });

        it("updates the review for its owner", async () => {
            const response = await request(app.getHttpServer())
                .patch(`/reviews/${reviewId}`)
                .set("Authorization", `Bearer ${authorToken}`)
                .send({ body: "Updated: still great!" })
                .expect(200);

            expect(response.body).toEqual(
                expect.objectContaining({ body: "Updated: still great!" }),
            );
        });
    });

    describe("POST/DELETE /reviews/:id/like", () => {
        it("rejects liking without a bearer token with 401", async () => {
            await request(app.getHttpServer())
                .post(`/reviews/${reviewId}/like`)
                .expect(401);
        });

        it("likes the review and reflects it in likedByMe", async () => {
            await request(app.getHttpServer())
                .post(`/reviews/${reviewId}/like`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(204);

            const response = await request(app.getHttpServer())
                .get(`/games/${seededGame.id}/reviews`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(200);

            expect(
                (response.body as { items: { likeCount: number; likedByMe: boolean }[] })
                    .items[0],
            ).toEqual(expect.objectContaining({ likeCount: 1, likedByMe: true }));
        });

        it("unlikes the review", async () => {
            await request(app.getHttpServer())
                .delete(`/reviews/${reviewId}/like`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(204);

            const response = await request(app.getHttpServer())
                .get(`/games/${seededGame.id}/reviews`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(200);

            expect(
                (response.body as { items: { likeCount: number; likedByMe: boolean }[] })
                    .items[0],
            ).toEqual(expect.objectContaining({ likeCount: 0, likedByMe: false }));
        });
    });

    describe("POST /reviews/:id/comments and GET /reviews/:id/comments", () => {
        it("rejects an empty comment body with 400", async () => {
            await request(app.getHttpServer())
                .post(`/reviews/${reviewId}/comments`)
                .set("Authorization", `Bearer ${otherToken}`)
                .send({ body: "" })
                .expect(400);
        });

        it("adds a comment as another user", async () => {
            const response = await request(app.getHttpServer())
                .post(`/reviews/${reviewId}/comments`)
                .set("Authorization", `Bearer ${otherToken}`)
                .send({ body: "Nice review!" })
                .expect(201);

            expect(response.body).toEqual(
                expect.objectContaining({ body: "Nice review!" }),
            );
            commentId = (response.body as { id: string }).id;
        });

        it("lists comments with author info", async () => {
            const response = await request(app.getHttpServer())
                .get(`/reviews/${reviewId}/comments`)
                .set("Authorization", `Bearer ${authorToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.objectContaining({
                    items: [
                        expect.objectContaining({
                            id: commentId,
                            body: "Nice review!",
                            author: {
                                id: expect.any(String) as string,
                                username: "reader_one",
                            },
                        }),
                    ],
                }),
            );
        });
    });

    describe("DELETE /comments/:id", () => {
        it("rejects deletion from a non-owner with 403", async () => {
            await request(app.getHttpServer())
                .delete(`/comments/${commentId}`)
                .set("Authorization", `Bearer ${authorToken}`)
                .expect(403);
        });

        it("deletes the comment for its author", async () => {
            await request(app.getHttpServer())
                .delete(`/comments/${commentId}`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(204);
        });
    });

    describe("DELETE /reviews/:id", () => {
        it("rejects deletion from a non-owner with 403", async () => {
            await request(app.getHttpServer())
                .delete(`/reviews/${reviewId}`)
                .set("Authorization", `Bearer ${otherToken}`)
                .expect(403);
        });

        it("deletes the review for its owner", async () => {
            await request(app.getHttpServer())
                .delete(`/reviews/${reviewId}`)
                .set("Authorization", `Bearer ${authorToken}`)
                .expect(204);

            const response = await request(app.getHttpServer())
                .get(`/games/${seededGame.id}/reviews`)
                .set("Authorization", `Bearer ${authorToken}`)
                .expect(200);

            expect((response.body as { total: number }).total).toBe(0);
        });
    });
});
