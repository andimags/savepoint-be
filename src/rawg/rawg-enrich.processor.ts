import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job, Queue } from "bullmq";
import { GamesService } from "../games/games.service";
import { RawgApiService, RawgGame } from "./rawg-api.service";

const BATCH_LIMIT = 40;

const EDITION_SUFFIXES =
    /\b(complete|ultimate|deluxe|definitive|gold|goty|game of the year|remastered|remake|intergrade|enhanced|standard|anniversary|legendary|director'?s cut|the pristine cut)\b/g;

/** Normalize a game title for fuzzy matching: lowercase, strip symbols and edition suffixes. */
function normalize(name: string): string {
    return name
        .toLowerCase()
        .replace(/[™®©]/g, "")
        .replace(/[:\-–—_'']/g, " ")
        .replace(EDITION_SUFFIXES, " ")
        .replace(/\bedition\b/g, " ")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** A cleaner query string gives RAWG's search far better hit rates than the raw Steam name. */
function toSearchQuery(name: string): string {
    return name
        .replace(/[™®©]/g, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** RAWG search is relevance-ranked; accept the top hit when it plausibly matches the local name. */
function isPlausibleMatch(localName: string, rawgName: string): boolean {
    const a = normalize(localName);
    const b = normalize(rawgName);
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;

    const aTokens = new Set(a.split(" "));
    const bTokens = new Set(b.split(" "));
    const shared = [...aTokens].filter((t) => bTokens.has(t)).length;
    const overlap = shared / Math.min(aTokens.size, bTokens.size);
    return overlap >= 0.5;
}

@Processor("rawg-enrich")
export class RawgEnrichProcessor extends WorkerHost {
    private readonly logger = new Logger(RawgEnrichProcessor.name);

    constructor(
        private readonly gamesService: GamesService,
        private readonly rawgApiService: RawgApiService,
        @InjectQueue("rawg-enrich")
        private readonly rawgEnrichQueue: Queue,
    ) {
        super();
    }

    async process(_job: Job): Promise<void> {
        if (!this.rawgApiService.isConfigured) {
            this.logger.warn(
                "Skipping RAWG enrichment — RAWG_API_KEY not configured",
            );
            return;
        }

        const games = await this.gamesService.findMissingRawgData(BATCH_LIMIT);
        this.logger.log(`Enriching ${games.length} games from RAWG`);

        let matched = 0;
        for (const game of games) {
            try {
                const results: RawgGame[] =
                    await this.rawgApiService.searchGames(
                        toSearchQuery(game.name),
                        5,
                    );
                const match = results.find((r) =>
                    isPlausibleMatch(game.name, r.name),
                );
                if (match) {
                    await this.gamesService.enrichGame(game, match);
                    matched++;
                } else {
                    // Mark as attempted so we don't re-query it forever
                    await this.gamesService.markEnrichmentAttempted(game.id);
                }
            } catch (error) {
                this.logger.warn(
                    `Enrichment failed for "${game.name}": ${error instanceof Error ? error.message : error}`,
                );
            }
        }
        this.logger.log(`Enriched ${matched}/${games.length} games`);

        // Keep draining until every game has been attempted
        if (games.length === BATCH_LIMIT) {
            await this.rawgEnrichQueue.add("enrich", {});
        }
    }
}
