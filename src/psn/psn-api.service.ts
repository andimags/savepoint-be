import { BadRequestException, Injectable } from "@nestjs/common";
import {
    exchangeAccessCodeForAuthTokens,
    exchangeNpssoForAccessCode,
    exchangeRefreshTokenForAuthTokens,
    getProfileFromUserName,
    getUserPlayedGames,
} from "psn-api";

export interface PsnAuthResult {
    refreshToken: string;
    accountId: string;
    onlineId: string;
}

export interface PsnPlayedGame {
    titleId: string;
    name: string;
    imageUrl: string | null;
    playtimeMinutes: number;
    lastPlayedAt: Date | null;
}

const PLAYED_GAMES_PAGE_SIZE = 200;

/** ISO 8601 duration (e.g. "PT228H56M33S") → whole minutes. */
function isoDurationToMinutes(duration: string): number {
    const match = duration.match(
        /P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/,
    );
    if (!match) return 0;
    const [, days, hours, minutes, seconds] = match;
    const total =
        Number(days ?? 0) * 24 * 60 +
        Number(hours ?? 0) * 60 +
        Number(minutes ?? 0) +
        Math.floor(Number(seconds ?? 0) / 60);
    return total;
}

@Injectable()
export class PsnApiService {
    /**
     * Exchange a user-supplied NPSSO token for a long-lived refresh token and capture the
     * account's identity. The refresh token is what we persist so later syncs don't need the NPSSO.
     */
    async authenticateWithNpsso(npsso: string): Promise<PsnAuthResult> {
        const trimmed = npsso.trim();
        if (trimmed.length !== 64) {
            throw new BadRequestException(
                "Invalid NPSSO token. It should be the 64-character value from your PSN session.",
            );
        }

        try {
            const accessCode = await exchangeNpssoForAccessCode(trimmed);
            const authTokens =
                await exchangeAccessCodeForAuthTokens(accessCode);
            const { profile } = await getProfileFromUserName(
                { accessToken: authTokens.accessToken },
                "me",
            );

            return {
                refreshToken: authTokens.refreshToken,
                accountId: profile.accountId,
                onlineId: profile.onlineId,
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error
                    ? `PSN authentication failed: ${error.message}`
                    : "PSN authentication failed. Your NPSSO token may be expired.",
            );
        }
    }

    /** Mint a fresh access token from a stored refresh token. */
    async refreshAccessToken(refreshToken: string): Promise<string> {
        const authTokens =
            await exchangeRefreshTokenForAuthTokens(refreshToken);
        return authTokens.accessToken;
    }

    /** Fetch every played title for the authenticating account, following pagination. */
    async getPlayedGames(accessToken: string): Promise<PsnPlayedGame[]> {
        const games: PsnPlayedGame[] = [];
        let offset = 0;

        for (;;) {
            const response = await getUserPlayedGames(
                { accessToken },
                "me",
                { limit: PLAYED_GAMES_PAGE_SIZE, offset },
            );

            for (const title of response.titles) {
                games.push({
                    titleId: title.titleId,
                    name: title.name,
                    imageUrl: title.imageUrl || null,
                    playtimeMinutes: isoDurationToMinutes(title.playDuration),
                    lastPlayedAt: title.lastPlayedDateTime
                        ? new Date(title.lastPlayedDateTime)
                        : null,
                });
            }

            offset += response.titles.length;
            if (
                response.titles.length === 0 ||
                offset >= response.totalItemCount
            ) {
                break;
            }
        }

        return games;
    }
}
