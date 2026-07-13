import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface RawgGame {
    id: number;
    slug: string;
    name: string;
    background_image: string | null;
    released: string | null;
    metacritic: number | null;
    genres: { name: string }[];
    description_raw?: string;
}

interface RawgListResponse {
    results: RawgGame[];
}

@Injectable()
export class RawgApiService {
    private readonly logger = new Logger(RawgApiService.name);
    private readonly apiKey: string | undefined;
    private readonly baseUrl = "https://api.rawg.io/api";

    constructor(configService: ConfigService) {
        this.apiKey = configService.get<string>("RAWG_API_KEY");
    }

    get isConfigured(): boolean {
        return Boolean(this.apiKey);
    }

    async searchGames(query: string, pageSize = 10): Promise<RawgGame[]> {
        const data = await this.request<RawgListResponse>("/games", {
            search: query,
            page_size: String(pageSize),
        });
        return data?.results ?? [];
    }

    async getGame(rawgId: number): Promise<RawgGame | null> {
        return this.request<RawgGame>(`/games/${rawgId}`, {});
    }

    async getGamesByGenres(
        genreSlugs: string[],
        pageSize = 20,
    ): Promise<RawgGame[]> {
        const data = await this.request<RawgListResponse>("/games", {
            genres: genreSlugs.join(","),
            ordering: "-rating",
            page_size: String(pageSize),
        });
        return data?.results ?? [];
    }

    /** Popular, highly-rated recent games for the browse view. */
    async getPopularGames(pageSize = 24): Promise<RawgGame[]> {
        const data = await this.request<RawgListResponse>("/games", {
            ordering: "-added",
            page_size: String(pageSize),
            metacritic: "75,100",
        });
        return data?.results ?? [];
    }

    private async request<T>(
        path: string,
        params: Record<string, string>,
    ): Promise<T | null> {
        if (!this.apiKey) {
            throw new ServiceUnavailableException(
                "RAWG_API_KEY is not configured",
            );
        }
        const url = new URL(`${this.baseUrl}${path}`);
        url.searchParams.set("key", this.apiKey);
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
        const res = await fetch(url);
        if (res.status === 404) return null;
        if (!res.ok) {
            this.logger.warn(`RAWG request failed: ${res.status} ${path}`);
            throw new ServiceUnavailableException("RAWG API request failed");
        }
        return (await res.json()) as T;
    }
}
