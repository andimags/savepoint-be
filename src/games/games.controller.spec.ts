/* eslint-disable @typescript-eslint/unbound-method -- passing jest.Mocked methods to expect() is safe */
import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { GamesController } from "./games.controller";
import { GamesService } from "./games.service";
import { Game } from "./game.entity";

describe("GamesController", () => {
    let controller: GamesController;
    let gamesService: jest.Mocked<GamesService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [GamesController],
            providers: [
                {
                    provide: GamesService,
                    useValue: {
                        search: jest.fn(),
                        browse: jest.fn(),
                        enqueueEnrichment: jest.fn(),
                        getById: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get(GamesController);
        gamesService = module.get(GamesService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("search", () => {
        it("throws BadRequestException when q is missing", () => {
            expect(() => controller.search(undefined)).toThrow(
                BadRequestException,
            );
        });

        it("throws BadRequestException when q is blank", () => {
            expect(() => controller.search("   ")).toThrow(BadRequestException);
        });

        it("trims the query and delegates to the service", async () => {
            gamesService.search.mockResolvedValue([]);

            await controller.search("  zelda  ");

            expect(gamesService.search).toHaveBeenCalledWith("zelda");
        });
    });

    describe("browse", () => {
        it("delegates to the service", async () => {
            const games = [{ id: "game-1" }] as Game[];
            gamesService.browse.mockResolvedValue(games);

            const result = await controller.browse();

            expect(gamesService.browse).toHaveBeenCalled();
            expect(result).toBe(games);
        });
    });

    describe("enrich", () => {
        it("queues enrichment and reports it as queued", async () => {
            gamesService.enqueueEnrichment.mockResolvedValue(undefined);

            const result = await controller.enrich();

            expect(gamesService.enqueueEnrichment).toHaveBeenCalled();
            expect(result).toEqual({ queued: true });
        });
    });

    describe("getById", () => {
        it("delegates to the service with the given id", async () => {
            const game = { id: "game-1" } as Game;
            gamesService.getById.mockResolvedValue(game);

            const result = await controller.getById("game-1");

            expect(gamesService.getById).toHaveBeenCalledWith("game-1");
            expect(result).toBe(game);
        });
    });
});
