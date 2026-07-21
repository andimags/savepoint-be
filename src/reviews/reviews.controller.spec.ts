/* eslint-disable @typescript-eslint/unbound-method -- passing jest.Mocked methods to expect() is safe */
import { Test, TestingModule } from "@nestjs/testing";

import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

describe("ReviewsController", () => {
    let controller: ReviewsController;
    let reviewsService: jest.Mocked<ReviewsService>;

    const req = { user: { userId: "user-1" } };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ReviewsController],
            providers: [
                {
                    provide: ReviewsService,
                    useValue: {
                        create: jest.fn(),
                        findForGame: jest.fn(),
                        findRecent: jest.fn(),
                        findByUser: jest.fn(),
                        update: jest.fn(),
                        remove: jest.fn(),
                        like: jest.fn(),
                        unlike: jest.fn(),
                        addComment: jest.fn(),
                        findComments: jest.fn(),
                        removeComment: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get(ReviewsController);
        reviewsService = module.get(ReviewsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("creates a review for the requesting user", () => {
        void controller.create(req, "game-1", { body: "Great game!" });

        expect(reviewsService.create).toHaveBeenCalledWith(
            req.user.userId,
            "game-1",
            "Great game!",
        );
    });

    describe("pagination clamping", () => {
        it("defaults page and limit when omitted", () => {
            void controller.forGame(req, "game-1", undefined, undefined);

            expect(reviewsService.findForGame).toHaveBeenCalledWith(
                "game-1",
                req.user.userId,
                1,
                10,
            );
        });

        it("clamps limit to a maximum of 50", () => {
            void controller.forGame(req, "game-1", "1", "500");

            expect(reviewsService.findForGame).toHaveBeenCalledWith(
                "game-1",
                req.user.userId,
                1,
                50,
            );
        });

        it("clamps page to a minimum of 1", () => {
            void controller.forGame(req, "game-1", "-5", "10");

            expect(reviewsService.findForGame).toHaveBeenCalledWith(
                "game-1",
                req.user.userId,
                1,
                10,
            );
        });

        it("clamps limit to a minimum of 1", () => {
            void controller.forGame(req, "game-1", "1", "-5");

            expect(reviewsService.findForGame).toHaveBeenCalledWith(
                "game-1",
                req.user.userId,
                1,
                1,
            );
        });

        it("falls back to defaults for non-numeric input", () => {
            void controller.forGame(req, "game-1", "abc", "xyz");

            expect(reviewsService.findForGame).toHaveBeenCalledWith(
                "game-1",
                req.user.userId,
                1,
                10,
            );
        });
    });

    it("lists recent reviews for the requesting viewer", () => {
        void controller.recent(req, "2", "20");

        expect(reviewsService.findRecent).toHaveBeenCalledWith(
            req.user.userId,
            2,
            20,
        );
    });

    it("lists reviews by another user", () => {
        void controller.byUser(req, "user-2", "1", "10");

        expect(reviewsService.findByUser).toHaveBeenCalledWith(
            "user-2",
            req.user.userId,
            1,
            10,
        );
    });

    it("updates a review owned by the requesting user", () => {
        void controller.update(req, "review-1", { body: "Updated" });

        expect(reviewsService.update).toHaveBeenCalledWith(
            req.user.userId,
            "review-1",
            "Updated",
        );
    });

    it("removes a review owned by the requesting user", async () => {
        await controller.remove(req, "review-1");

        expect(reviewsService.remove).toHaveBeenCalledWith(
            req.user.userId,
            "review-1",
        );
    });

    it("likes a review", async () => {
        await controller.like(req, "review-1");

        expect(reviewsService.like).toHaveBeenCalledWith(
            req.user.userId,
            "review-1",
        );
    });

    it("unlikes a review", async () => {
        await controller.unlike(req, "review-1");

        expect(reviewsService.unlike).toHaveBeenCalledWith(
            req.user.userId,
            "review-1",
        );
    });

    it("adds a comment to a review", () => {
        void controller.addComment(req, "review-1", { body: "Nice!" });

        expect(reviewsService.addComment).toHaveBeenCalledWith(
            req.user.userId,
            "review-1",
            "Nice!",
        );
    });

    it("lists comments for a review", () => {
        void controller.comments("review-1", "1", "10");

        expect(reviewsService.findComments).toHaveBeenCalledWith(
            "review-1",
            1,
            10,
        );
    });

    it("removes a comment owned by the requesting user", async () => {
        await controller.removeComment(req, "comment-1");

        expect(reviewsService.removeComment).toHaveBeenCalledWith(
            req.user.userId,
            "comment-1",
        );
    });
});
