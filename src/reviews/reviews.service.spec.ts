import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Test, TestingModule } from "@nestjs/testing";

import { ReviewsService } from "./reviews.service";
import { Review } from "./review.entity";
import { ReviewLike } from "./review-like.entity";
import { ReviewComment } from "./review-comment.entity";
import { User } from "../users/user.entity";
import { Game } from "../games/game.entity";
import {
    createMockQueryBuilder,
    createMockRepository,
    MockQueryBuilder,
    MockRepository,
} from "../test-utils/mock-repository";

describe("ReviewsService", () => {
    let service: ReviewsService;
    let reviewsRepository: MockRepository<Review>;
    let likesRepository: MockRepository<ReviewLike>;
    let commentsRepository: MockRepository<ReviewComment>;
    let reviewsQueryBuilder: MockQueryBuilder;
    let likesQueryBuilder: MockQueryBuilder;
    let commentsQueryBuilder: MockQueryBuilder;

    const ownerId = "user-1";
    const otherUserId = "user-2";
    const viewerId = "viewer-1";

    const review: Review = {
        id: "review-1",
        userId: ownerId,
        user: { id: ownerId, username: "player_one" } as unknown as User,
        gameId: "game-1",
        game: { id: "game-1", name: "Some Game", coverUrl: null } as unknown as Game,
        body: "Great game!",
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReviewsService,
                {
                    provide: getRepositoryToken(Review),
                    useValue: createMockRepository<Review>(),
                },
                {
                    provide: getRepositoryToken(ReviewLike),
                    useValue: createMockRepository<ReviewLike>(),
                },
                {
                    provide: getRepositoryToken(ReviewComment),
                    useValue: createMockRepository<ReviewComment>(),
                },
            ],
        }).compile();

        service = module.get(ReviewsService);
        reviewsRepository = module.get(getRepositoryToken(Review));
        likesRepository = module.get(getRepositoryToken(ReviewLike));
        commentsRepository = module.get(getRepositoryToken(ReviewComment));

        reviewsQueryBuilder = createMockQueryBuilder();
        likesQueryBuilder = createMockQueryBuilder();
        commentsQueryBuilder = createMockQueryBuilder();
        reviewsRepository.createQueryBuilder!.mockReturnValue(reviewsQueryBuilder);
        likesRepository.createQueryBuilder!.mockReturnValue(likesQueryBuilder);
        commentsRepository.createQueryBuilder!.mockReturnValue(
            commentsQueryBuilder,
        );
        likesRepository.find!.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        it("creates and persists a new review", async () => {
            reviewsRepository.create!.mockReturnValue(review);
            reviewsRepository.save!.mockResolvedValue(review);

            const result = await service.create(ownerId, review.gameId, review.body);

            expect(reviewsRepository.create).toHaveBeenCalledWith({
                userId: ownerId,
                gameId: review.gameId,
                body: review.body,
            });
            expect(result).toBe(review);
        });
    });

    describe("update", () => {
        it("throws NotFoundException when the review does not exist", async () => {
            reviewsRepository.findOne!.mockResolvedValue(null);

            await expect(
                service.update(ownerId, "missing-review", "Updated"),
            ).rejects.toThrow(NotFoundException);
        });

        it("throws ForbiddenException when the review belongs to someone else", async () => {
            reviewsRepository.findOne!.mockResolvedValue({ ...review });

            await expect(
                service.update(otherUserId, review.id, "Updated"),
            ).rejects.toThrow(ForbiddenException);
        });

        it("updates the body when the caller owns the review", async () => {
            reviewsRepository.findOne!.mockResolvedValue({ ...review });
            reviewsRepository.save!.mockImplementation((r) => Promise.resolve(r));

            const result = await service.update(ownerId, review.id, "Updated");

            expect(result.body).toBe("Updated");
        });
    });

    describe("remove", () => {
        it("throws NotFoundException when the review does not exist", async () => {
            reviewsRepository.findOne!.mockResolvedValue(null);

            await expect(service.remove(ownerId, "missing-review")).rejects.toThrow(
                NotFoundException,
            );
        });

        it("throws ForbiddenException when the review belongs to someone else", async () => {
            reviewsRepository.findOne!.mockResolvedValue({ ...review });

            await expect(service.remove(otherUserId, review.id)).rejects.toThrow(
                ForbiddenException,
            );
        });

        it("removes the review when the caller owns it", async () => {
            reviewsRepository.findOne!.mockResolvedValue({ ...review });
            reviewsRepository.remove!.mockResolvedValue({ ...review });

            await service.remove(ownerId, review.id);

            expect(reviewsRepository.remove).toHaveBeenCalledWith(
                expect.objectContaining({ id: review.id }),
            );
        });
    });

    describe("findForGame", () => {
        it("shapes reviews for a game without the embedded game field", async () => {
            reviewsQueryBuilder.getManyAndCount.mockResolvedValue([[review], 1]);
            likesQueryBuilder.getRawMany.mockResolvedValue([
                { reviewId: review.id, count: "4" },
            ]);
            likesRepository.find!.mockResolvedValue([
                { reviewId: review.id, userId: viewerId },
            ]);
            commentsQueryBuilder.getRawMany.mockResolvedValue([
                { reviewId: review.id, count: "2" },
            ]);

            const result = await service.findForGame(review.gameId, viewerId, 1, 10);

            expect(reviewsQueryBuilder.andWhere).toHaveBeenCalledWith(
                "review.gameId = :gameId",
                { gameId: review.gameId },
            );
            expect(reviewsQueryBuilder.leftJoinAndSelect).not.toHaveBeenCalledWith(
                "review.game",
                "game",
            );
            expect(result.items[0]).toEqual(
                expect.objectContaining({
                    id: review.id,
                    likeCount: 4,
                    likedByMe: true,
                    commentCount: 2,
                    game: undefined,
                }),
            );
            expect(result).toEqual(
                expect.objectContaining({ total: 1, page: 1, limit: 10, totalPages: 1 }),
            );
        });
    });

    describe("findRecent", () => {
        it("includes the embedded game field and defaults likedByMe to false", async () => {
            reviewsQueryBuilder.getManyAndCount.mockResolvedValue([[review], 1]);
            likesQueryBuilder.getRawMany.mockResolvedValue([]);
            likesRepository.find!.mockResolvedValue([]);
            commentsQueryBuilder.getRawMany.mockResolvedValue([]);

            const result = await service.findRecent(viewerId, 1, 10);

            expect(reviewsQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                "review.game",
                "game",
            );
            expect(result.items[0]).toEqual(
                expect.objectContaining({
                    likeCount: 0,
                    likedByMe: false,
                    commentCount: 0,
                    game: { id: "game-1", name: "Some Game", coverUrl: null },
                }),
            );
        });
    });

    describe("like", () => {
        it("throws NotFoundException when the review does not exist", async () => {
            reviewsRepository.exists!.mockResolvedValue(false);

            await expect(service.like(viewerId, "missing-review")).rejects.toThrow(
                NotFoundException,
            );
        });

        it("does nothing when the review is already liked", async () => {
            reviewsRepository.exists!.mockResolvedValue(true);
            likesRepository.findOne!.mockResolvedValue({
                reviewId: review.id,
                userId: viewerId,
            });

            await service.like(viewerId, review.id);

            expect(likesRepository.save).not.toHaveBeenCalled();
        });

        it("creates a like when not already liked", async () => {
            reviewsRepository.exists!.mockResolvedValue(true);
            likesRepository.findOne!.mockResolvedValue(null);
            likesRepository.create!.mockImplementation((v) => v as ReviewLike);
            likesRepository.save!.mockResolvedValue(undefined);

            await service.like(viewerId, review.id);

            expect(likesRepository.create).toHaveBeenCalledWith({
                userId: viewerId,
                reviewId: review.id,
            });
            expect(likesRepository.save).toHaveBeenCalled();
        });
    });

    describe("unlike", () => {
        it("deletes the like row", async () => {
            likesRepository.delete!.mockResolvedValue({ affected: 1 });

            await service.unlike(viewerId, review.id);

            expect(likesRepository.delete).toHaveBeenCalledWith({
                userId: viewerId,
                reviewId: review.id,
            });
        });
    });

    describe("addComment", () => {
        it("throws NotFoundException when the review does not exist", async () => {
            reviewsRepository.exists!.mockResolvedValue(false);

            await expect(
                service.addComment(viewerId, "missing-review", "Nice!"),
            ).rejects.toThrow(NotFoundException);
        });

        it("creates and persists a comment", async () => {
            reviewsRepository.exists!.mockResolvedValue(true);
            const comment = { id: "comment-1", userId: viewerId, reviewId: review.id, body: "Nice!" };
            commentsRepository.create!.mockReturnValue(comment);
            commentsRepository.save!.mockResolvedValue(comment);

            const result = await service.addComment(viewerId, review.id, "Nice!");

            expect(commentsRepository.create).toHaveBeenCalledWith({
                userId: viewerId,
                reviewId: review.id,
                body: "Nice!",
            });
            expect(result).toBe(comment);
        });
    });

    describe("findComments", () => {
        it("shapes comments with author info and pagination", async () => {
            commentsRepository.findAndCount!.mockResolvedValue([
                [
                    {
                        id: "comment-1",
                        body: "Nice!",
                        createdAt: new Date(),
                        user: { id: viewerId, username: "commenter" },
                    },
                ],
                1,
            ]);

            const result = await service.findComments(review.id, 1, 10);

            expect(result.items[0]).toEqual(
                expect.objectContaining({
                    id: "comment-1",
                    body: "Nice!",
                    author: { id: viewerId, username: "commenter" },
                }),
            );
            expect(result.total).toBe(1);
        });
    });

    describe("removeComment", () => {
        it("throws NotFoundException when the comment does not exist", async () => {
            commentsRepository.findOne!.mockResolvedValue(null);

            await expect(
                service.removeComment(viewerId, "missing-comment"),
            ).rejects.toThrow(NotFoundException);
        });

        it("throws ForbiddenException when the comment belongs to someone else", async () => {
            commentsRepository.findOne!.mockResolvedValue({
                id: "comment-1",
                userId: otherUserId,
            });

            await expect(
                service.removeComment(viewerId, "comment-1"),
            ).rejects.toThrow(ForbiddenException);
        });

        it("removes the comment when the caller owns it", async () => {
            const comment = { id: "comment-1", userId: viewerId };
            commentsRepository.findOne!.mockResolvedValue(comment);
            commentsRepository.remove!.mockResolvedValue(comment);

            await service.removeComment(viewerId, "comment-1");

            expect(commentsRepository.remove).toHaveBeenCalledWith(comment);
        });
    });
});
