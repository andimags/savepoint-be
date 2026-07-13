import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SteamOwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url?: string;
  rtime_last_played?: number;
}

const STEAMID64_REGEX = /^\d{17}$/;

@Injectable()
export class SteamApiService {
  private readonly apiKey: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.getOrThrow<string>('STEAM_API_KEY');
  }

  /** Accepts a raw SteamID64, a full profile URL, or a vanity name, and resolves it to a SteamID64. */
  async resolveToSteamId64(input: string): Promise<string> {
    const trimmed = input.trim();
    const vanityMatch = trimmed.match(/steamcommunity\.com\/id\/([^/]+)/i);
    const profileMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/i);

    if (profileMatch) {
      return profileMatch[1];
    }
    if (STEAMID64_REGEX.test(trimmed)) {
      return trimmed;
    }

    const vanity = vanityMatch ? vanityMatch[1] : trimmed;
    const url = new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('vanityurl', vanity);

    const res = await fetch(url);
    const data = (await res.json()) as { response: { success: number; steamid?: string } };
    if (data.response.success !== 1 || !data.response.steamid) {
      throw new BadRequestException('Could not resolve Steam profile. Check the URL or SteamID.');
    }
    return data.response.steamid;
  }

  async getOwnedGames(steamId64: string): Promise<SteamOwnedGame[]> {
    const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('steamid', steamId64);
    url.searchParams.set('include_appinfo', '1');
    url.searchParams.set('include_played_free_games', '1');
    url.searchParams.set('format', 'json');

    const res = await fetch(url);
    if (!res.ok) {
      throw new BadRequestException('Steam API request failed');
    }
    const data = (await res.json()) as { response: { games?: SteamOwnedGame[] } };
    return data.response.games ?? [];
  }

  /**
   * Use the store header image (460×215) rather than the tiny 32×32 community icon,
   * so library/games thumbnails render crisply. RAWG enrichment later replaces this with
   * an even higher-res cover where a match is found.
   */
  static coverUrl(appid: number): string {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
  }
}
