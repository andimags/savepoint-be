/* eslint-disable @typescript-eslint/unbound-method -- passing jest.Mocked methods to expect() is safe */
import { Test, TestingModule } from "@nestjs/testing";

import { ListsController } from "./lists.controller";
import { ListsService } from "./lists.service";

describe("ListsController", () => {
    let controller: ListsController;
    let listsService: jest.Mocked<ListsService>;

    const req = { user: { userId: "user-1" } };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ListsController],
            providers: [
                {
                    provide: ListsService,
                    useValue: {
                        create: jest.fn(),
                        findByUser: jest.fn(),
                        findOne: jest.fn(),
                        update: jest.fn(),
                        remove: jest.fn(),
                        addItem: jest.fn(),
                        removeItem: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get(ListsController);
        listsService = module.get(ListsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("creates a list for the requesting user", () => {
        void controller.create(req, { title: "My List", description: "desc" });

        expect(listsService.create).toHaveBeenCalledWith(
            req.user.userId,
            "My List",
            "desc",
        );
    });

    it("defaults description to null when omitted on create", () => {
        void controller.create(req, { title: "My List" });

        expect(listsService.create).toHaveBeenCalledWith(
            req.user.userId,
            "My List",
            null,
        );
    });

    it("lists the requesting user's own lists", () => {
        void controller.mine(req);

        expect(listsService.findByUser).toHaveBeenCalledWith(req.user.userId);
    });

    it("lists another user's lists by id", () => {
        void controller.byUser("user-2");

        expect(listsService.findByUser).toHaveBeenCalledWith("user-2");
    });

    it("fetches a single list by id", () => {
        void controller.findOne("list-1");

        expect(listsService.findOne).toHaveBeenCalledWith("list-1");
    });

    it("updates a list owned by the requesting user", () => {
        void controller.update(req, "list-1", { title: "New Title" });

        expect(listsService.update).toHaveBeenCalledWith(
            req.user.userId,
            "list-1",
            "New Title",
            null,
        );
    });

    it("removes a list owned by the requesting user", async () => {
        await controller.remove(req, "list-1");

        expect(listsService.remove).toHaveBeenCalledWith(
            req.user.userId,
            "list-1",
        );
    });

    it("adds an item to a list", () => {
        void controller.addItem(req, "list-1", { gameId: "game-1" });

        expect(listsService.addItem).toHaveBeenCalledWith(
            req.user.userId,
            "list-1",
            "game-1",
        );
    });

    it("removes an item from a list", async () => {
        await controller.removeItem(req, "list-1", "item-1");

        expect(listsService.removeItem).toHaveBeenCalledWith(
            req.user.userId,
            "list-1",
            "item-1",
        );
    });
});
