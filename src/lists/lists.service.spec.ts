import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Test, TestingModule } from "@nestjs/testing";

import { ListsService } from "./lists.service";
import { List } from "./list.entity";
import { ListItem } from "./list-item.entity";
import { User } from "../users/user.entity";
import {
    createMockQueryBuilder,
    createMockRepository,
    MockQueryBuilder,
    MockRepository,
} from "../test-utils/mock-repository";

describe("ListsService", () => {
    let service: ListsService;
    let listsRepository: MockRepository<List>;
    let itemsRepository: MockRepository<ListItem>;
    let queryBuilder: MockQueryBuilder;

    const ownerId = "user-1";
    const otherUserId = "user-2";

    const list: List = {
        id: "list-1",
        userId: ownerId,
        user: { id: ownerId, username: "player_one" } as unknown as User,
        title: "My Favorites",
        description: null,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ListsService,
                {
                    provide: getRepositoryToken(List),
                    useValue: createMockRepository<List>(),
                },
                {
                    provide: getRepositoryToken(ListItem),
                    useValue: createMockRepository<ListItem>(),
                },
            ],
        }).compile();

        service = module.get(ListsService);
        listsRepository = module.get(getRepositoryToken(List));
        itemsRepository = module.get(getRepositoryToken(ListItem));

        queryBuilder = createMockQueryBuilder();
        itemsRepository.createQueryBuilder!.mockReturnValue(queryBuilder);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        it("creates and persists a new list", async () => {
            listsRepository.create!.mockReturnValue(list);
            listsRepository.save!.mockResolvedValue(list);

            const result = await service.create(ownerId, list.title, null);

            expect(listsRepository.create).toHaveBeenCalledWith({
                userId: ownerId,
                title: list.title,
                description: null,
            });
            expect(result).toBe(list);
        });
    });

    describe("update", () => {
        it("throws NotFoundException when the list does not exist", async () => {
            listsRepository.findOne!.mockResolvedValue(null);

            await expect(
                service.update(ownerId, "missing-list", "New Title", null),
            ).rejects.toThrow(NotFoundException);
        });

        it("throws ForbiddenException when the list belongs to someone else", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });

            await expect(
                service.update(otherUserId, list.id, "New Title", null),
            ).rejects.toThrow(ForbiddenException);
        });

        it("updates the title and description when the caller owns the list", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });
            listsRepository.save!.mockImplementation((l) => Promise.resolve(l));

            const result = await service.update(
                ownerId,
                list.id,
                "New Title",
                "New description",
            );

            expect(result.title).toBe("New Title");
            expect(result.description).toBe("New description");
        });
    });

    describe("remove", () => {
        it("throws NotFoundException when the list does not exist", async () => {
            listsRepository.findOne!.mockResolvedValue(null);

            await expect(service.remove(ownerId, "missing-list")).rejects.toThrow(
                NotFoundException,
            );
        });

        it("throws ForbiddenException when the list belongs to someone else", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });

            await expect(service.remove(otherUserId, list.id)).rejects.toThrow(
                ForbiddenException,
            );
        });

        it("removes the list when the caller owns it", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });
            listsRepository.remove!.mockResolvedValue({ ...list });

            await service.remove(ownerId, list.id);

            expect(listsRepository.remove).toHaveBeenCalledWith(
                expect.objectContaining({ id: list.id }),
            );
        });
    });

    describe("findByUser", () => {
        it("returns the user's lists with computed item counts", async () => {
            listsRepository.find!.mockResolvedValue([list]);
            queryBuilder.getRawMany.mockResolvedValue([
                { listId: list.id, count: "3" },
            ]);

            const result = await service.findByUser(ownerId);

            expect(result).toEqual([{ ...list, itemCount: 3 }]);
        });

        it("defaults to zero items when there are no items for a list", async () => {
            listsRepository.find!.mockResolvedValue([list]);
            queryBuilder.getRawMany.mockResolvedValue([]);

            const result = await service.findByUser(ownerId);

            expect(result[0].itemCount).toBe(0);
        });
    });

    describe("findRecentByAuthors", () => {
        it("shapes recent lists with owner info and item counts", async () => {
            listsRepository.find!.mockResolvedValue([list]);
            queryBuilder.getRawMany.mockResolvedValue([
                { listId: list.id, count: "2" },
            ]);

            const result = await service.findRecentByAuthors([ownerId], 10);

            expect(result).toEqual([
                {
                    id: list.id,
                    title: list.title,
                    description: list.description,
                    itemCount: 2,
                    createdAt: list.createdAt,
                    owner: { id: ownerId, username: "player_one" },
                },
            ]);
        });
    });

    describe("findOne", () => {
        it("throws NotFoundException when the list does not exist", async () => {
            listsRepository.findOne!.mockResolvedValue(null);

            await expect(service.findOne("missing-list")).rejects.toThrow(
                NotFoundException,
            );
        });

        it("returns the list shape with its items", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });
            itemsRepository.find!.mockResolvedValue([
                {
                    id: "item-1",
                    position: 0,
                    game: { id: "game-1", name: "Some Game" },
                } as any,
            ]);

            const result = await service.findOne(list.id);

            expect(result).toEqual({
                id: list.id,
                title: list.title,
                description: list.description,
                createdAt: list.createdAt,
                updatedAt: list.updatedAt,
                owner: { id: ownerId, username: "player_one" },
                items: [
                    {
                        id: "item-1",
                        position: 0,
                        game: { id: "game-1", name: "Some Game" },
                    },
                ],
            });
        });
    });

    describe("addItem", () => {
        it("throws NotFoundException when the list does not exist", async () => {
            listsRepository.findOne!.mockResolvedValue(null);

            await expect(
                service.addItem(ownerId, "missing-list", "game-1"),
            ).rejects.toThrow(NotFoundException);
        });

        it("throws ForbiddenException when the list belongs to someone else", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });

            await expect(
                service.addItem(otherUserId, list.id, "game-1"),
            ).rejects.toThrow(ForbiddenException);
        });

        it("returns the existing item instead of duplicating it", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });
            const existingItem = { id: "item-1", listId: list.id, gameId: "game-1" };
            itemsRepository.findOne!.mockResolvedValue(existingItem);

            const result = await service.addItem(ownerId, list.id, "game-1");

            expect(result).toBe(existingItem);
            expect(itemsRepository.save).not.toHaveBeenCalled();
        });

        it("appends a new item after the current max position", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });
            itemsRepository.findOne!.mockResolvedValue(null);
            queryBuilder.getRawOne.mockResolvedValue({ max: "2" });
            itemsRepository.create!.mockImplementation((v) => v as ListItem);
            itemsRepository.save!.mockImplementation((v) =>
                Promise.resolve(v as ListItem),
            );

            const result = await service.addItem(ownerId, list.id, "game-1");

            expect(itemsRepository.create).toHaveBeenCalledWith({
                listId: list.id,
                gameId: "game-1",
                position: 3,
            });
            expect(result.position).toBe(3);
        });

        it("starts at position 0 for the first item in a list", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });
            itemsRepository.findOne!.mockResolvedValue(null);
            queryBuilder.getRawOne.mockResolvedValue({ max: "-1" });
            itemsRepository.create!.mockImplementation((v) => v as ListItem);
            itemsRepository.save!.mockImplementation((v) =>
                Promise.resolve(v as ListItem),
            );

            const result = await service.addItem(ownerId, list.id, "game-1");

            expect(result.position).toBe(0);
        });
    });

    describe("removeItem", () => {
        it("throws NotFoundException when the list does not exist", async () => {
            listsRepository.findOne!.mockResolvedValue(null);

            await expect(
                service.removeItem(ownerId, "missing-list", "item-1"),
            ).rejects.toThrow(NotFoundException);
        });

        it("throws ForbiddenException when the list belongs to someone else", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });

            await expect(
                service.removeItem(otherUserId, list.id, "item-1"),
            ).rejects.toThrow(ForbiddenException);
        });

        it("deletes the item when the caller owns the list", async () => {
            listsRepository.findOne!.mockResolvedValue({ ...list });
            itemsRepository.delete!.mockResolvedValue({ affected: 1 });

            await service.removeItem(ownerId, list.id, "item-1");

            expect(itemsRepository.delete).toHaveBeenCalledWith({
                id: "item-1",
                listId: list.id,
            });
        });
    });
});
