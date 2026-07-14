import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ILike, In, Not, Repository } from "typeorm";
import { Follow } from "./follow.entity";
import { User } from "../users/user.entity";
import { Game } from "../games/game.entity";
import { GameStatus, UserGame } from "../user-games/user-game.entity";
import {
    Platform,
    PlatformConnection,
    SyncStatus,
} from "../platform-connections/platform-connection.entity";
import { ReviewsService } from "../reviews/reviews.service";
import { DiaryService } from "../diary/diary.service";
import { ListsService } from "../lists/lists.service";

@Injectable()
export class SocialService {
    constructor(
        @InjectRepository(Follow)
        private readonly followsRepository: Repository<Follow>,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        @InjectRepository(UserGame)
        private readonly userGamesRepository: Repository<UserGame>,
        @InjectRepository(Game)
        private readonly gamesRepository: Repository<Game>,
        @InjectRepository(PlatformConnection)
        private readonly connectionsRepository: Repository<PlatformConnection>,
        private readonly reviewsService: ReviewsService,
        private readonly diaryService: DiaryService,
        private readonly listsService: ListsService,
    ) {}

    /**
     * Unified home feed of recent reviews, diary logs, and new lists from the
     * people the viewer follows, newest first.
     */
    async activityFeed(viewerId: string, page: number, limit: number) {
        const following = await this.followsRepository.find({
            where: { followerId: viewerId },
        });
        const authorIds = following.map((f) => f.followingId);
        if (authorIds.length === 0) {
            return { items: [], page, limit, hasMore: false };
        }

        const window = page * limit;
        const [reviewPage, diaryEntries, recentLists] = await Promise.all([
            this.reviewsService.findRecentByAuthors(viewerId, authorIds, window),
            this.diaryService.findRecentByAuthors(authorIds, window),
            this.listsService.findRecentByAuthors(authorIds, window),
        ]);

        const reviewItems = reviewPage.items.map((review) => ({
            type: "review" as const,
            createdAt: review.createdAt,
            review,
        }));
        const diaryItems = diaryEntries.map((entry) => ({
            type: "diary" as const,
            createdAt: entry.createdAt,
            diary: {
                id: entry.id,
                playedOn: entry.playedOn,
                platform: entry.platform,
                status: entry.status,
                note: entry.note,
                game: {
                    id: entry.game.id,
                    name: entry.game.name,
                    coverUrl: entry.game.coverUrl,
                },
                author: { id: entry.user.id, username: entry.user.username },
            },
        }));
        const listItems = recentLists.map((list) => ({
            type: "list" as const,
            createdAt: list.createdAt,
            list: {
                id: list.id,
                title: list.title,
                description: list.description,
                itemCount: list.itemCount,
                author: list.owner,
            },
        }));

        const merged = [...reviewItems, ...diaryItems, ...listItems].sort(
            (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
        );
        const start = (page - 1) * limit;
        const items = merged.slice(start, start + limit);
        return {
            items,
            page,
            limit,
            hasMore: merged.length > start + limit,
        };
    }

    async profileStats(userId: string) {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
        });
        if (!user) throw new NotFoundException("User not found");

        const [
            autoTopGames,
            genreRows,
            recentDiary,
            favoriteGame,
            curatedGames,
        ] = await Promise.all([
            this.userGamesRepository.find({
                where: { userId },
                relations: { game: true },
                order: { playtimeMinutes: "DESC" },
                take: 5,
            }),
            this.userGamesRepository.query<{ genre: string; count: string }[]>(
                `SELECT unnest(g.genres) AS genre, COUNT(*) AS count
         FROM user_games ug JOIN games g ON g.id = ug."gameId"
         WHERE ug."userId" = $1
         GROUP BY 1 ORDER BY count DESC, genre ASC LIMIT 5`,
                [userId],
            ),
            this.diaryService.findRecentForUser(userId, 5),
            user.favoriteGameId
                ? this.gamesRepository.findOne({
                      where: { id: user.favoriteGameId },
                  })
                : Promise.resolve(null),
            user.topGameIds.length > 0
                ? this.gamesRepository.find({
                      where: { id: In(user.topGameIds) },
                  })
                : Promise.resolve([]),
        ]);

        // Curated favorite games (user-picked, in their chosen order) fall back to most-played.
        const curated = user.topGameIds
            .map((id) => curatedGames.find((g) => g.id === id))
            .filter((g): g is NonNullable<typeof g> => Boolean(g))
            .map((g) => ({ id: g.id, name: g.name, coverUrl: g.coverUrl }));
        const favoriteGames =
            curated.length > 0
                ? curated
                : autoTopGames
                      .filter((ug) => ug.playtimeMinutes > 0)
                      .map((ug) => ({
                          id: ug.game.id,
                          name: ug.game.name,
                          coverUrl: ug.game.coverUrl,
                      }));

        // Curated favorite genres fall back to most-tagged.
        const favoriteGenres =
            user.favoriteGenres.length > 0
                ? user.favoriteGenres
                : genreRows.map((r) => r.genre);

        // Whether the user has explicitly curated any favorite. The profile
        // spotlight is hidden when false, so auto-derived fallbacks above never
        // make the section appear on their own.
        const hasFavorites = Boolean(
            user.favoriteGameId ||
                user.topGameIds.length > 0 ||
                user.favoriteGenres.length > 0 ||
                user.topFranchise,
        );

        return {
            hasFavorites,
            favoriteGame: favoriteGame
                ? {
                      id: favoriteGame.id,
                      name: favoriteGame.name,
                      coverUrl: favoriteGame.coverUrl,
                  }
                : null,
            favoriteGames,
            favoriteGenres,
            favoriteFranchise: user.topFranchise,
            curated: curated.length > 0,
            recentDiary: recentDiary.map((entry) => ({
                id: entry.id,
                playedOn: entry.playedOn,
                status: entry.status,
                platform: entry.platform,
                note: entry.note,
                game: {
                    id: entry.game.id,
                    name: entry.game.name,
                    coverUrl: entry.game.coverUrl,
                },
            })),
        };
    }

    async searchUsers(viewerId: string, query: string) {
        const users = await this.usersRepository.find({
            where: { username: ILike(`%${query}%`), id: Not(viewerId) },
            order: { username: "ASC" },
            take: 20,
        });
        if (users.length === 0) return [];

        const follows = await this.followsRepository.find({
            where: {
                followerId: viewerId,
                followingId: In(users.map((u) => u.id)),
            },
        });
        const followingIds = new Set(follows.map((f) => f.followingId));

        return users.map((user) => ({
            id: user.id,
            username: user.username,
            isFollowing: followingIds.has(user.id),
        }));
    }

    async follow(followerId: string, followingId: string): Promise<void> {
        if (followerId === followingId) {
            throw new BadRequestException("You cannot follow yourself");
        }
        const target = await this.usersRepository.findOne({
            where: { id: followingId },
        });
        if (!target) throw new NotFoundException("User not found");
        const existing = await this.followsRepository.findOne({
            where: { followerId, followingId },
        });
        if (!existing) {
            await this.followsRepository.save(
                this.followsRepository.create({ followerId, followingId }),
            );
        }
    }

    async unfollow(followerId: string, followingId: string): Promise<void> {
        await this.followsRepository.delete({ followerId, followingId });
    }

    async followers(userId: string) {
        const follows = await this.followsRepository.find({
            where: { followingId: userId },
            relations: { follower: true },
            order: { createdAt: "DESC" },
        });
        return follows.map((f) => ({
            id: f.follower.id,
            username: f.follower.username,
        }));
    }

    async following(userId: string) {
        const follows = await this.followsRepository.find({
            where: { followerId: userId },
            relations: { following: true },
            order: { createdAt: "DESC" },
        });
        return follows.map((f) => ({
            id: f.following.id,
            username: f.following.username,
        }));
    }

    /** Games the people I follow are currently playing, most recently updated first. */
    async playingFeed(viewerId: string, limit = 20) {
        const following = await this.followsRepository.find({
            where: { followerId: viewerId },
        });
        const followingIds = following.map((f) => f.followingId);
        if (followingIds.length === 0) return [];

        const rows = await this.userGamesRepository.find({
            where: { userId: In(followingIds), status: GameStatus.PLAYING },
            relations: { game: true, user: true },
            order: { updatedAt: "DESC" },
            take: limit,
        });
        return rows.map((row) => ({
            user: { id: row.user.id, username: row.user.username },
            game: {
                id: row.game.id,
                name: row.game.name,
                coverUrl: row.game.coverUrl,
            },
            playtimeMinutes: row.playtimeMinutes,
            updatedAt: row.updatedAt,
        }));
    }

    async profile(userId: string, viewerId: string) {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
        });
        if (!user) throw new NotFoundException("User not found");

        const [
            followerCount,
            followingCount,
            gameCount,
            isFollowing,
            connections,
        ] = await Promise.all([
            this.followsRepository.count({
                where: { followingId: userId },
            }),
            this.followsRepository.count({ where: { followerId: userId } }),
            this.userGamesRepository.count({ where: { userId } }),
            this.followsRepository.exists({
                where: { followerId: viewerId, followingId: userId },
            }),
            this.syncedConnections(user),
        ]);

        return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt,
            followerCount,
            followingCount,
            gameCount,
            isFollowing,
            isSelf: userId === viewerId,
            connections,
        };
    }

    /**
     * Platform connections whose library sync has completed, shown as badges on
     * the profile. The label is the user's edit-profile display name for the
     * platform. When the name is unset we send null and the client omits the
     * badge — we never fall back to the raw synced identifier (Steam's numeric
     * id or PSN's online id). steamId64 is still returned so the client can link
     * to the public Steam profile. Secrets such as the PSN refresh token never
     * leave the server.
     */
    private async syncedConnections(user: User) {
        const connections = await this.connectionsRepository.find({
            where: { userId: user.id, syncStatus: SyncStatus.DONE },
            order: { platform: "ASC" },
        });
        return connections.map((connection) => {
            if (connection.platform === Platform.PSN) {
                return {
                    platform: connection.platform,
                    username: user.psnUsername,
                    steamId64: null as string | null,
                };
            }
            return {
                platform: connection.platform,
                username: user.steamUsername,
                steamId64: connection.steamId64,
            };
        });
    }
}
