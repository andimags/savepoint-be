import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import { App } from "supertest/types";
import { DataSource, Repository } from "typeorm";

import { AuthModule } from "../src/auth/auth.module";
import { UsersModule } from "../src/users/users.module";
import { User } from "../src/users/user.entity";

// Points the app at a disposable database so this suite never touches dev data.
const TEST_DATABASE_URL =
    "postgres://savepoint:savepoint@localhost:5433/savepoint_test";

interface AuthResponseBody {
    accessToken: string;
    user: { id: string; email: string; username: string };
}

describe("Auth (e2e)", () => {
    let app: INestApplication<App>;
    let usersRepository: Repository<User>;
    let dataSource: DataSource;

    beforeAll(async () => {
        process.env.DATABASE_URL = TEST_DATABASE_URL;
        process.env.JWT_SECRET ??= "test-secret";

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                TypeOrmModule.forRoot({
                    type: "postgres",
                    url: TEST_DATABASE_URL,
                    entities: [User],
                    synchronize: true,
                    dropSchema: true,
                }),
                AuthModule,
                UsersModule,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        usersRepository = moduleFixture.get(getRepositoryToken(User));
        dataSource = moduleFixture.get(DataSource);
    });

    afterEach(async () => {
        await usersRepository.clear();
    });

    // Leaves the test database schema-free once the suite finishes, so no dummy
    // rows or tables persist between runs (the `dropSchema` init handles a run
    // that got interrupted before this could execute).
    afterAll(async () => {
        await dataSource.dropDatabase();
        await app.close();
    });

    describe("POST /auth/register", () => {
        it("registers a new user and returns an access token", async () => {
            const response = await request(app.getHttpServer())
                .post("/auth/register")
                .send({
                    email: "player@example.com",
                    username: "player_one",
                    password: "password123",
                })
                .expect(201);

            const body = response.body as AuthResponseBody;
            expect(typeof body.accessToken).toBe("string");
            expect(body.user).toEqual(
                expect.objectContaining({
                    email: "player@example.com",
                    username: "player_one",
                }),
            );
        });

        it("rejects an invalid email with 400", async () => {
            await request(app.getHttpServer())
                .post("/auth/register")
                .send({
                    email: "not-an-email",
                    username: "player_one",
                    password: "password123",
                })
                .expect(400);
        });

        it("rejects a short password with 400", async () => {
            await request(app.getHttpServer())
                .post("/auth/register")
                .send({
                    email: "player@example.com",
                    username: "player_one",
                    password: "short",
                })
                .expect(400);
        });

        it("rejects a username with disallowed characters with 400", async () => {
            await request(app.getHttpServer())
                .post("/auth/register")
                .send({
                    email: "player@example.com",
                    username: "not valid!",
                    password: "password123",
                })
                .expect(400);
        });

        it("rejects a duplicate email with 409", async () => {
            await request(app.getHttpServer()).post("/auth/register").send({
                email: "player@example.com",
                username: "player_one",
                password: "password123",
            });

            await request(app.getHttpServer())
                .post("/auth/register")
                .send({
                    email: "player@example.com",
                    username: "player_two",
                    password: "password123",
                })
                .expect(409);
        });

        it("rejects a duplicate username with 409", async () => {
            await request(app.getHttpServer()).post("/auth/register").send({
                email: "player-one@example.com",
                username: "player_one",
                password: "password123",
            });

            await request(app.getHttpServer())
                .post("/auth/register")
                .send({
                    email: "player-two@example.com",
                    username: "player_one",
                    password: "password123",
                })
                .expect(409);
        });
    });

    describe("POST /auth/login", () => {
        beforeEach(async () => {
            await request(app.getHttpServer()).post("/auth/register").send({
                email: "player@example.com",
                username: "player_one",
                password: "password123",
            });
        });

        it("logs in with valid credentials and returns 200 with an access token", async () => {
            const response = await request(app.getHttpServer())
                .post("/auth/login")
                .send({ email: "player@example.com", password: "password123" })
                .expect(200);

            const body = response.body as AuthResponseBody;
            expect(typeof body.accessToken).toBe("string");
        });

        it("rejects an unknown email with 401", async () => {
            await request(app.getHttpServer())
                .post("/auth/login")
                .send({ email: "nobody@example.com", password: "password123" })
                .expect(401);
        });

        it("rejects an incorrect password with 401", async () => {
            await request(app.getHttpServer())
                .post("/auth/login")
                .send({ email: "player@example.com", password: "wrong-password" })
                .expect(401);
        });
    });

    describe("GET /users/me", () => {
        it("rejects requests without a bearer token with 401", async () => {
            await request(app.getHttpServer()).get("/users/me").expect(401);
        });

        it("rejects requests with an invalid token with 401", async () => {
            await request(app.getHttpServer())
                .get("/users/me")
                .set("Authorization", "Bearer not-a-real-token")
                .expect(401);
        });

        it("returns the authenticated user's profile with a valid token", async () => {
            const registerResponse = await request(app.getHttpServer())
                .post("/auth/register")
                .send({
                    email: "player@example.com",
                    username: "player_one",
                    password: "password123",
                });
            const { accessToken } = registerResponse.body as AuthResponseBody;

            const response = await request(app.getHttpServer())
                .get("/users/me")
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body).toEqual(
                expect.objectContaining({
                    email: "player@example.com",
                    username: "player_one",
                }),
            );
        });
    });
});
