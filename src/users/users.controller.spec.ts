/* eslint-disable @typescript-eslint/unbound-method -- passing jest.Mocked methods to expect() is safe */
import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { CloudinaryService } from "./cloudinary.service";
import { User } from "./user.entity";

describe("UsersController", () => {
    let controller: UsersController;
    let usersService: jest.Mocked<UsersService>;
    let cloudinaryService: jest.Mocked<CloudinaryService>;

    const req = { user: { userId: "user-1" } };

    const user: User = {
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
            controllers: [UsersController],
            providers: [
                {
                    provide: UsersService,
                    useValue: {
                        findById: jest.fn(),
                        updateProfile: jest.fn(),
                        changePassword: jest.fn(),
                        setAvatarUrl: jest.fn(),
                    },
                },
                {
                    provide: CloudinaryService,
                    useValue: {
                        uploadAvatar: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get(UsersController);
        usersService = module.get(UsersService);
        cloudinaryService = module.get(CloudinaryService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("me", () => {
        it("returns null when no user is found", async () => {
            usersService.findById.mockResolvedValue(null);

            const result = await controller.me(req);

            expect(result).toBeNull();
        });

        it("returns the public profile shape when the user exists", async () => {
            usersService.findById.mockResolvedValue(user);

            const result = await controller.me(req);

            expect(result).toEqual(
                expect.objectContaining({
                    id: user.id,
                    email: user.email,
                    username: user.username,
                }),
            );
            expect(result).not.toHaveProperty("passwordHash");
        });
    });

    describe("updateProfile", () => {
        it("delegates to the service and returns the public profile shape", async () => {
            usersService.updateProfile.mockResolvedValue({
                ...user,
                displayName: "New Name",
            });

            const result = await controller.updateProfile(req, {
                displayName: "New Name",
            });

            expect(usersService.updateProfile).toHaveBeenCalledWith(
                req.user.userId,
                { displayName: "New Name" },
            );
            expect(result.displayName).toBe("New Name");
        });
    });

    describe("changePassword", () => {
        it("delegates to the service with the current and new password", async () => {
            usersService.changePassword.mockResolvedValue(undefined);

            await controller.changePassword(req, {
                currentPassword: "current-password",
                newPassword: "new-password",
            });

            expect(usersService.changePassword).toHaveBeenCalledWith(
                req.user.userId,
                "current-password",
                "new-password",
            );
        });
    });

    describe("uploadAvatar", () => {
        it("throws BadRequestException when no file is provided", async () => {
            await expect(controller.uploadAvatar(req, undefined)).rejects.toThrow(
                BadRequestException,
            );
        });

        it("throws BadRequestException for a disallowed mimetype", async () => {
            const file = {
                buffer: Buffer.from("data"),
                mimetype: "application/pdf",
                size: 10,
                originalname: "file.pdf",
            };

            await expect(controller.uploadAvatar(req, file)).rejects.toThrow(
                BadRequestException,
            );
            expect(cloudinaryService.uploadAvatar).not.toHaveBeenCalled();
        });

        it("uploads the avatar and updates the user on success", async () => {
            const file = {
                buffer: Buffer.from("data"),
                mimetype: "image/png",
                size: 10,
                originalname: "file.png",
            };
            cloudinaryService.uploadAvatar.mockResolvedValue(
                "https://cdn.example.com/avatar.png",
            );
            usersService.setAvatarUrl.mockResolvedValue({
                ...user,
                avatarUrl: "https://cdn.example.com/avatar.png",
            });

            const result = await controller.uploadAvatar(req, file);

            expect(cloudinaryService.uploadAvatar).toHaveBeenCalledWith(
                `data:image/png;base64,${file.buffer.toString("base64")}`,
                req.user.userId,
            );
            expect(usersService.setAvatarUrl).toHaveBeenCalledWith(
                req.user.userId,
                "https://cdn.example.com/avatar.png",
            );
            expect(result.avatarUrl).toBe("https://cdn.example.com/avatar.png");
        });
    });
});
