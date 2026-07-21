/* eslint-disable @typescript-eslint/unbound-method -- passing jest.Mocked methods to expect() is safe */
import { NotFoundException } from "@nestjs/common";
import { getQueueToken } from "@nestjs/bullmq";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Test, TestingModule } from "@nestjs/testing";
import { Queue } from "bullmq";

import { GamesService } from "./games.service";
import { Game } from "./game.entity";
import { RawgApiService, RawgGame } from "../rawg/rawg-api.service";
import { createMockRepository, MockRepository } from "../test-utils/mock-repository";

describe("GamesService", () => {
    let service: GamesService;
    let repository: MockRepository<Game>;
    let rawgApiService: jest.Mocked<RawgApiService>;
    let queue: jest.Mocked<Queue>;

    const rawgGame: RawgGame = {
        id: 42,
        slug: "example-game",
        name: "Example Game",
        background_image: "https://rawg.example.com/cover.png",
        released: "2024-01-01",
        metacritic: 88,
        genres: [{ name: "Action" }],
        description_raw: "An example game.",
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GamesService,
                {
                    provide: getRepositoryToken(Game),
                    useValue: createMockRepository<Game>(),
                },
                {
                    provide: RawgApiService,
                    useValue: {
                        isConfigured: false,
                        searchGames: jest.fn(),
                        getPopularGames: jest.fn(),
                        getGame: jest.fn(),
                    },
                },
                {
                    provide: getQueueToken("rawg-enrich"),
                    useValue: { add: jest.fn() },
                },
            ],
        }).compile();

        service = module.get(GamesService);
        repository = module.get(getRepositoryToken(Game));
        rawgApiService = module.get(RawgApiService);
        queue = module.get(getQueueToken("rawg-enrich"));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("onApplicationBootstrap", () => {
        it("does nothing when RAWG is not configured", async () => {
            await service.onApplicationBootstrap();

            expect(repository.count).not.toHaveBeenCalled();
            expect(queue.add).not.toHaveBeenCalled();
        });

        it("queues enrichment when unenriched games are pending", async () => {
            Object.defineProperty(rawgApiService, "isConfigured", {
                value: true,
            });
            repository.count!.mockResolvedValue(3);

            await service.onApplicationBootstrap();

            expect(queue.add).toHaveBeenCalledWith("enrich", {});
        });

        it("does not queue enrichment when nothing is pending", async () => {
            Object.defineProperty(rawgApiService, "isConfigured", {
                value: true,
            });
            repository.count!.mockResolvedValue(0);

            await service.onApplicationBootstrap();

            expect(queue.add).not.toHaveBeenCalled();
        });
    });

    describe("upsertBySteamAppId", () => {
        it("creates a new game when none exists for the Steam app id", async () => {
            repository.findOne!.mockResolvedValue(null);
            repository.create!.mockImplementation((v) => v as Game);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.upsertBySteamAppId(
                123,
                "Steam Game",
                "https://cdn.example.com/icon.png",
            );

            expect(repository.create).toHaveBeenCalledWith({
                steamAppId: 123,
                name: "Steam Game",
                coverUrl: "https://cdn.example.com/icon.png",
            });
            expect(result.name).toBe("Steam Game");
        });

        it("updates the name and cover of an existing, un-enriched game", async () => {
            const existing = {
                steamAppId: 123,
                name: "Old Name",
                coverUrl: "old-cover.png",
                rawgId: null,
            } as Game;
            repository.findOne!.mockResolvedValue(existing);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.upsertBySteamAppId(
                123,
                "New Name",
                "new-cover.png",
            );

            expect(result.name).toBe("New Name");
            expect(result.coverUrl).toBe("new-cover.png");
        });

        it("keeps the RAWG cover art when the game is already enriched", async () => {
            const existing = {
                steamAppId: 123,
                name: "Old Name",
                coverUrl: "rawg-cover.png",
                rawgId: 42,
            } as Game;
            repository.findOne!.mockResolvedValue(existing);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.upsertBySteamAppId(
                123,
                "New Name",
                "steam-icon.png",
            );

            expect(result.coverUrl).toBe("rawg-cover.png");
        });
    });

    describe("upsertByPsnTitleId", () => {
        it("creates a new game when none exists for the PSN title id", async () => {
            repository.findOne!.mockResolvedValue(null);
            repository.create!.mockImplementation((v) => v as Game);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.upsertByPsnTitleId(
                "CUSA00001_00",
                "PSN Game",
                "cover.png",
            );

            expect(repository.create).toHaveBeenCalledWith({
                psnTitleId: "CUSA00001_00",
                name: "PSN Game",
                coverUrl: "cover.png",
            });
            expect(result.name).toBe("PSN Game");
        });
    });

    describe("upsertFromRawg", () => {
        it("updates the existing game matched by rawgId", async () => {
            const existing = { id: "game-1", name: "Old Name" } as Game;
            repository.findOne!.mockResolvedValueOnce(existing);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.upsertFromRawg(rawgGame);

            expect(repository.findOne).toHaveBeenCalledWith({
                where: { rawgId: rawgGame.id },
            });
            expect(result.rawgId).toBe(rawgGame.id);
            expect(result.name).toBe(rawgGame.name);
            expect(result.genres).toEqual(["Action"]);
        });

        it("merges into a name-matched, un-enriched Steam row instead of duplicating", async () => {
            const steamRow = { id: "game-2", name: rawgGame.name, rawgId: null } as Game;
            repository.findOne!
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(steamRow);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.upsertFromRawg(rawgGame);

            expect(result.id).toBe("game-2");
            expect(result.rawgId).toBe(rawgGame.id);
        });

        it("creates a new row when no existing game matches", async () => {
            repository.findOne!.mockResolvedValue(null);
            repository.create!.mockImplementation((v) => v as Game);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.upsertFromRawg(rawgGame);

            expect(repository.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: rawgGame.name }),
            );
            expect(result.rawgId).toBe(rawgGame.id);
        });
    });

    describe("search", () => {
        it("returns the local cache when RAWG is not configured", async () => {
            const local = [{ id: "game-1", name: "Local Game" }] as Game[];
            repository.find!.mockResolvedValue(local);

            const result = await service.search("query");

            expect(result).toBe(local);
            expect(rawgApiService.searchGames).not.toHaveBeenCalled();
        });

        it("merges local results with RAWG results when configured", async () => {
            Object.defineProperty(rawgApiService, "isConfigured", {
                value: true,
            });
            const local = [{ id: "game-1", name: "Local Game" }] as Game[];
            repository.find!.mockResolvedValue(local);
            rawgApiService.searchGames.mockResolvedValue([rawgGame]);
            repository.findOne!.mockResolvedValue(null);
            repository.create!.mockImplementation((v) => v as Game);
            repository.save!.mockImplementation((v) =>
                Promise.resolve({ id: "game-3", ...v } as Game),
            );

            const result = await service.search("query");

            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: "game-1" }),
                    expect.objectContaining({ id: "game-3" }),
                ]),
            );
        });

        it("falls back to the local cache when RAWG search fails", async () => {
            Object.defineProperty(rawgApiService, "isConfigured", {
                value: true,
            });
            const local = [{ id: "game-1", name: "Local Game" }] as Game[];
            repository.find!.mockResolvedValue(local);
            rawgApiService.searchGames.mockRejectedValue(new Error("RAWG down"));

            const result = await service.search("query");

            expect(result).toBe(local);
        });
    });

    describe("browse", () => {
        it("returns local cache when RAWG is not configured", async () => {
            const local = [{ id: "game-1" }] as Game[];
            repository.find!.mockResolvedValue(local);

            const result = await service.browse();

            expect(result).toBe(local);
        });

        it("returns RAWG-derived games when configured and available", async () => {
            Object.defineProperty(rawgApiService, "isConfigured", {
                value: true,
            });
            rawgApiService.getPopularGames.mockResolvedValue([rawgGame]);
            repository.findOne!.mockResolvedValue(null);
            repository.create!.mockImplementation((v) => v as Game);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.browse();

            expect(result).toHaveLength(1);
            expect(repository.find).not.toHaveBeenCalled();
        });

        it("falls back to the local cache when RAWG browse fails", async () => {
            Object.defineProperty(rawgApiService, "isConfigured", {
                value: true,
            });
            rawgApiService.getPopularGames.mockRejectedValue(new Error("RAWG down"));
            const local = [{ id: "game-1" }] as Game[];
            repository.find!.mockResolvedValue(local);

            const result = await service.browse();

            expect(result).toBe(local);
        });
    });

    describe("getById", () => {
        it("throws NotFoundException when the game does not exist", async () => {
            repository.findOne!.mockResolvedValue(null);

            await expect(service.getById("missing-id")).rejects.toThrow(
                NotFoundException,
            );
        });

        it("returns the game as-is when it has no RAWG id to enrich from", async () => {
            const game = { id: "game-1", rawgId: null, description: null } as Game;
            repository.findOne!.mockResolvedValue(game);

            const result = await service.getById("game-1");

            expect(result).toBe(game);
            expect(rawgApiService.getGame).not.toHaveBeenCalled();
        });

        it("enriches the game with full details on first view", async () => {
            const game = { id: "game-1", rawgId: 42, description: null } as Game;
            repository.findOne!.mockResolvedValue(game);
            Object.defineProperty(rawgApiService, "isConfigured", {
                value: true,
            });
            rawgApiService.getGame.mockResolvedValue(rawgGame);
            repository.save!.mockImplementation((v) => Promise.resolve(v as Game));

            const result = await service.getById("game-1");

            expect(result.description).toBe(rawgGame.description_raw);
        });

        it("serves what it has when RAWG enrichment fails", async () => {
            const game = { id: "game-1", rawgId: 42, description: null } as Game;
            repository.findOne!.mockResolvedValue(game);
            Object.defineProperty(rawgApiService, "isConfigured", {
                value: true,
            });
            rawgApiService.getGame.mockRejectedValue(new Error("RAWG down"));

            const result = await service.getById("game-1");

            expect(result).toBe(game);
        });
    });

    describe("findByIds", () => {
        it("returns an empty array without querying when given no ids", async () => {
            const result = await service.findByIds([]);

            expect(result).toEqual([]);
            expect(repository.find).not.toHaveBeenCalled();
        });

        it("queries the repository when given ids", async () => {
            const games = [{ id: "game-1" }] as Game[];
            repository.find!.mockResolvedValue(games);

            const result = await service.findByIds(["game-1"]);

            expect(result).toBe(games);
        });
    });

    describe("markEnrichmentAttempted / countMissingRawgData / findMissingRawgData", () => {
        it("marks a game as attempted", async () => {
            repository.update!.mockResolvedValue(undefined);

            await service.markEnrichmentAttempted("game-1");

            expect(repository.update).toHaveBeenCalledWith(
                "game-1",
                expect.objectContaining({ rawgEnrichedAt: expect.any(Date) as Date }),
            );
        });

        it("counts games missing RAWG data", async () => {
            repository.count!.mockResolvedValue(5);

            const result = await service.countMissingRawgData();

            expect(result).toBe(5);
        });

        it("finds games missing RAWG data up to the given limit", async () => {
            const games = [{ id: "game-1" }] as Game[];
            repository.find!.mockResolvedValue(games);

            const result = await service.findMissingRawgData(10);

            expect(result).toBe(games);
        });
    });
});
