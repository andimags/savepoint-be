import {
    BadRequestException,
    ConflictException,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";

import { UsersService } from "./users.service";
import { User } from "./user.entity";
import { createMockRepository, MockRepository } from "../test-utils/mock-repository";

jest.mock("bcrypt");

describe("UsersService", () => {
    let service: UsersService;
    let repository: MockRepository<User>;

    const baseUser: User = {
        id: "user-1",
        email: "player@example.com",
        username: "player_one",
        displayName: null,
        avatarUrl: null,
        favoriteGameId: null,
        topGameIds: [],
        favoriteGenres: [],
        topFranchise: null,
        steamUsername: null,
        psnUsername: null,
        passwordHash: "hashed-password",
        createdAt: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                {
                    provide: getRepositoryToken(User),
                    useValue: createMockRepository<User>(),
                },
            ],
        }).compile();

        service = module.get(UsersService);
        repository = module.get(getRepositoryToken(User));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("findByEmail / findByUsername / findById", () => {
        it("looks up a user by email", async () => {
            repository.findOne!.mockResolvedValue(baseUser);

            const result = await service.findByEmail(baseUser.email);

            expect(repository.findOne).toHaveBeenCalledWith({
                where: { email: baseUser.email },
            });
            expect(result).toBe(baseUser);
        });

        it("looks up a user by username", async () => {
            repository.findOne!.mockResolvedValue(baseUser);

            const result = await service.findByUsername(baseUser.username);

            expect(repository.findOne).toHaveBeenCalledWith({
                where: { username: baseUser.username },
            });
            expect(result).toBe(baseUser);
        });

        it("looks up a user by id", async () => {
            repository.findOne!.mockResolvedValue(baseUser);

            const result = await service.findById(baseUser.id);

            expect(repository.findOne).toHaveBeenCalledWith({
                where: { id: baseUser.id },
            });
            expect(result).toBe(baseUser);
        });
    });

    describe("create", () => {
        it("creates and persists a new user", async () => {
            repository.create!.mockReturnValue(baseUser);
            repository.save!.mockResolvedValue(baseUser);

            const result = await service.create(
                baseUser.email,
                baseUser.username,
                baseUser.passwordHash,
            );

            expect(repository.create).toHaveBeenCalledWith({
                email: baseUser.email,
                username: baseUser.username,
                passwordHash: baseUser.passwordHash,
            });
            expect(repository.save).toHaveBeenCalledWith(baseUser);
            expect(result).toBe(baseUser);
        });
    });

    describe("updateProfile", () => {
        it("throws NotFoundException when the user does not exist", async () => {
            repository.findOne!.mockResolvedValue(null);

            await expect(
                service.updateProfile("missing-user", { displayName: "New" }),
            ).rejects.toThrow(NotFoundException);
        });

        it("throws ConflictException when the new username is taken by someone else", async () => {
            repository.findOne!
                .mockResolvedValueOnce({ ...baseUser })
                .mockResolvedValueOnce({ ...baseUser, id: "other-user" });

            await expect(
                service.updateProfile(baseUser.id, { username: "taken_name" }),
            ).rejects.toThrow(ConflictException);
            expect(repository.save).not.toHaveBeenCalled();
        });

        it("allows keeping the same username without a conflict check", async () => {
            repository.findOne!.mockResolvedValueOnce({ ...baseUser });
            repository.save!.mockImplementation((u) => Promise.resolve(u));

            const result = await service.updateProfile(baseUser.id, {
                username: baseUser.username,
            });

            expect(repository.findOne).toHaveBeenCalledTimes(1);
            expect(result.username).toBe(baseUser.username);
        });

        it("trims and normalizes profile fields, and caps array fields", async () => {
            repository.findOne!.mockResolvedValueOnce({ ...baseUser });
            repository.save!.mockImplementation((u) => Promise.resolve(u));

            const result = await service.updateProfile(baseUser.id, {
                displayName: "  New Name  ",
                favoriteGameId: null,
                topGameIds: ["a", "b", "c", "d", "e", "f"],
                favoriteGenres: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
                topFranchise: "  Franchise  ",
                steamUsername: "  steam_name  ",
                psnUsername: null,
            });

            expect(result.displayName).toBe("New Name");
            expect(result.favoriteGameId).toBeNull();
            expect(result.topGameIds).toEqual(["a", "b", "c", "d", "e"]);
            expect(result.favoriteGenres).toHaveLength(8);
            expect(result.topFranchise).toBe("Franchise");
            expect(result.steamUsername).toBe("steam_name");
            expect(result.psnUsername).toBeNull();
        });

        it("clears displayName/topFranchise/steamUsername when given blank strings", async () => {
            repository.findOne!.mockResolvedValueOnce({
                ...baseUser,
                displayName: "Old",
                topFranchise: "Old Franchise",
                steamUsername: "old_steam",
            });
            repository.save!.mockImplementation((u) => Promise.resolve(u));

            const result = await service.updateProfile(baseUser.id, {
                displayName: "   ",
                topFranchise: "   ",
                steamUsername: "   ",
            });

            expect(result.displayName).toBeNull();
            expect(result.topFranchise).toBeNull();
            expect(result.steamUsername).toBeNull();
        });
    });

    describe("setAvatarUrl", () => {
        it("throws NotFoundException when the user does not exist", async () => {
            repository.findOne!.mockResolvedValue(null);

            await expect(
                service.setAvatarUrl("missing-user", "https://example.com/a.png"),
            ).rejects.toThrow(NotFoundException);
        });

        it("sets and persists the avatar url", async () => {
            repository.findOne!.mockResolvedValue({ ...baseUser });
            repository.save!.mockImplementation((u) => Promise.resolve(u));

            const result = await service.setAvatarUrl(
                baseUser.id,
                "https://example.com/a.png",
            );

            expect(result.avatarUrl).toBe("https://example.com/a.png");
        });
    });

    describe("changePassword", () => {
        it("throws NotFoundException when the user does not exist", async () => {
            repository.findOne!.mockResolvedValue(null);

            await expect(
                service.changePassword(
                    "missing-user",
                    "current-password",
                    "new-password",
                ),
            ).rejects.toThrow(NotFoundException);
        });

        it("throws UnauthorizedException when the current password is wrong", async () => {
            repository.findOne!.mockResolvedValue({ ...baseUser });
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(
                service.changePassword(baseUser.id, "wrong-password", "new-password"),
            ).rejects.toThrow(UnauthorizedException);
        });

        it("throws BadRequestException when the new password is too short", async () => {
            repository.findOne!.mockResolvedValue({ ...baseUser });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            await expect(
                service.changePassword(baseUser.id, "current-password", "short"),
            ).rejects.toThrow(BadRequestException);
            expect(repository.save).not.toHaveBeenCalled();
        });

        it("hashes and persists the new password when valid", async () => {
            repository.findOne!.mockResolvedValue({ ...baseUser });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            (bcrypt.hash as jest.Mock).mockResolvedValue("new-hashed-password");
            repository.save!.mockResolvedValue({ ...baseUser });

            await service.changePassword(
                baseUser.id,
                "current-password",
                "new-password",
            );

            expect(bcrypt.hash).toHaveBeenCalledWith("new-password", 10);
            expect(repository.save).toHaveBeenCalledWith(
                expect.objectContaining({ passwordHash: "new-hashed-password" }),
            );
        });
    });
});
