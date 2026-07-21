/* eslint-disable @typescript-eslint/unbound-method -- passing jest.Mocked methods to expect() is safe */
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";

import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { User } from "../users/user.entity";

jest.mock("bcrypt");

describe("AuthService", () => {
    let authService: AuthService;
    let usersService: jest.Mocked<UsersService>;
    let jwtService: jest.Mocked<JwtService>;

    const user = {
        id: "user-1",
        email: "player@example.com",
        username: "player_one",
        passwordHash: "hashed-password",
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: UsersService,
                    useValue: {
                        findByEmail: jest.fn(),
                        findByUsername: jest.fn(),
                        create: jest.fn(),
                    },
                },
                {
                    provide: JwtService,
                    useValue: {
                        sign: jest.fn().mockReturnValue("signed-jwt"),
                    },
                },
            ],
        }).compile();

        authService = module.get(AuthService);
        usersService = module.get(UsersService);
        jwtService = module.get(JwtService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("register", () => {
        it("throws ConflictException when the email is already registered", async () => {
            usersService.findByEmail.mockResolvedValue(user as unknown as User);

            await expect(
                authService.register(user.email, user.username, "password123"),
            ).rejects.toThrow(ConflictException);
            expect(usersService.create).not.toHaveBeenCalled();
        });

        it("throws ConflictException when the username is already taken", async () => {
            usersService.findByEmail.mockResolvedValue(null);
            usersService.findByUsername.mockResolvedValue(user as unknown as User);

            await expect(
                authService.register(user.email, user.username, "password123"),
            ).rejects.toThrow(ConflictException);
            expect(usersService.create).not.toHaveBeenCalled();
        });

        it("hashes the password, creates the user, and returns a signed token", async () => {
            usersService.findByEmail.mockResolvedValue(null);
            usersService.findByUsername.mockResolvedValue(null);
            usersService.create.mockResolvedValue(user as unknown as User);
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");

            const result = await authService.register(
                user.email,
                user.username,
                "password123",
            );

            expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
            expect(usersService.create).toHaveBeenCalledWith(
                user.email,
                user.username,
                "hashed-password",
            );
            expect(jwtService.sign).toHaveBeenCalledWith({
                sub: user.id,
                email: user.email,
                username: user.username,
            });
            expect(result).toEqual({
                accessToken: "signed-jwt",
                user: { id: user.id, email: user.email, username: user.username },
            });
        });
    });

    describe("login", () => {
        it("throws UnauthorizedException when no user matches the email", async () => {
            usersService.findByEmail.mockResolvedValue(null);

            await expect(
                authService.login(user.email, "password123"),
            ).rejects.toThrow(UnauthorizedException);
        });

        it("throws UnauthorizedException when the password does not match", async () => {
            usersService.findByEmail.mockResolvedValue(user as unknown as User);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(
                authService.login(user.email, "wrong-password"),
            ).rejects.toThrow(UnauthorizedException);
        });

        it("returns a signed token when credentials are valid", async () => {
            usersService.findByEmail.mockResolvedValue(user as unknown as User);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            const result = await authService.login(user.email, "password123");

            expect(bcrypt.compare).toHaveBeenCalledWith(
                "password123",
                user.passwordHash,
            );
            expect(result).toEqual({
                accessToken: "signed-jwt",
                user: { id: user.id, email: user.email, username: user.username },
            });
        });
    });
});
