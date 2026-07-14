import "dotenv/config";
import { Logger } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { DataSource, In } from "typeorm";
import { AppDataSource } from "../data-source";
import { User } from "../../users/user.entity";
import { Game } from "../../games/game.entity";
import { UserGame } from "../../user-games/user-game.entity";
import { DiaryEntry } from "../../diary/diary-entry.entity";
import { List } from "../../lists/list.entity";
import { ListItem } from "../../lists/list-item.entity";
import { Follow } from "../../social/follow.entity";
import {
    SEED_FOLLOWS,
    SEED_GAMES,
    SEED_PASSWORD,
    SEED_USERS,
    type SeedUser,
} from "./seed-data";

const logger = new Logger("Seed");

function dateDaysAgo(days: number): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date;
}

function isoDateDaysAgo(days: number): string {
    return dateDaysAgo(days).toISOString().slice(0, 10);
}

async function upsertGames(dataSource: DataSource): Promise<Map<string, Game>> {
    const gamesRepository = dataSource.getRepository(Game);
    const byName = new Map<string, Game>();

    for (const seedGame of SEED_GAMES) {
        const existing = await gamesRepository.findOne({
            where: { name: seedGame.name },
        });
        if (existing) {
            byName.set(seedGame.name, existing);
            continue;
        }
        const created = await gamesRepository.save(
            gamesRepository.create({
                name: seedGame.name,
                genres: seedGame.genres,
                releaseDate: seedGame.releaseDate,
            }),
        );
        byName.set(seedGame.name, created);
    }

    return byName;
}

// Remove any prior run's users so the seed is safely repeatable. User-owned
// rows (libraries, diaries, lists, follows) cascade on delete via their FKs.
async function clearExistingSeedUsers(dataSource: DataSource): Promise<void> {
    const usersRepository = dataSource.getRepository(User);
    const emails = SEED_USERS.map((user) => user.email);
    const existing = await usersRepository.find({
        where: { email: In(emails) },
    });
    if (existing.length > 0) {
        await usersRepository.remove(existing);
        logger.log(`Removed ${existing.length} existing seed user(s).`);
    }
}

async function createUser(
    dataSource: DataSource,
    seedUser: SeedUser,
    games: Map<string, Game>,
    passwordHash: string,
): Promise<User> {
    const gameId = (name: string): string => {
        const game = games.get(name);
        if (!game) {
            throw new Error(`Seed game not found: ${name}`);
        }
        return game.id;
    };

    const user = await dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({
            email: seedUser.email,
            username: seedUser.username,
            displayName: seedUser.displayName,
            passwordHash,
            favoriteGameId: seedUser.favoriteGameName
                ? gameId(seedUser.favoriteGameName)
                : null,
            topGameIds: seedUser.topGameNames.map(gameId),
            favoriteGenres: seedUser.favoriteGenres,
            topFranchise: seedUser.topFranchise,
        }),
    );

    const userGamesRepository = dataSource.getRepository(UserGame);
    await userGamesRepository.save(
        seedUser.library.map((item) =>
            userGamesRepository.create({
                userId: user.id,
                gameId: gameId(item.gameName),
                platform: item.platform,
                status: item.status,
                playtimeMinutes: item.playtimeMinutes,
                lastPlayedAt: dateDaysAgo(item.daysSincePlayed),
            }),
        ),
    );

    const diaryRepository = dataSource.getRepository(DiaryEntry);
    await diaryRepository.save(
        seedUser.diary.map((entry) =>
            diaryRepository.create({
                userId: user.id,
                gameId: gameId(entry.gameName),
                playedOn: isoDateDaysAgo(entry.daysAgo),
                platform: entry.platform,
                status: entry.status,
                note: entry.note,
            }),
        ),
    );

    const list = await dataSource.getRepository(List).save(
        dataSource.getRepository(List).create({
            userId: user.id,
            title: seedUser.list.title,
            description: seedUser.list.description,
        }),
    );

    const listItemsRepository = dataSource.getRepository(ListItem);
    await listItemsRepository.save(
        seedUser.list.gameNames.map((name, index) =>
            listItemsRepository.create({
                listId: list.id,
                gameId: gameId(name),
                position: index,
            }),
        ),
    );

    return user;
}

async function createFollows(
    dataSource: DataSource,
    usersByUsername: Map<string, User>,
): Promise<void> {
    const followsRepository = dataSource.getRepository(Follow);
    const follows: Follow[] = [];

    for (const [followerUsername, followingUsername] of SEED_FOLLOWS) {
        const follower = usersByUsername.get(followerUsername);
        const following = usersByUsername.get(followingUsername);
        if (!follower || !following) continue;
        follows.push(
            followsRepository.create({
                followerId: follower.id,
                followingId: following.id,
            }),
        );
    }

    await followsRepository.save(follows);
}

async function seed(): Promise<void> {
    const dataSource = await AppDataSource.initialize();
    try {
        await clearExistingSeedUsers(dataSource);

        const games = await upsertGames(dataSource);
        const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
        const usersByUsername = new Map<string, User>();

        for (const seedUser of SEED_USERS) {
            const user = await createUser(
                dataSource,
                seedUser,
                games,
                passwordHash,
            );
            usersByUsername.set(user.username, user);
            logger.log(
                `Seeded ${user.username}: ${seedUser.library.length} library, ${seedUser.diary.length} diary, ${seedUser.list.gameNames.length} list item(s).`,
            );
        }

        await createFollows(dataSource, usersByUsername);

        logger.log(
            `Done. ${SEED_USERS.length} users seeded (password: "${SEED_PASSWORD}").`,
        );
    } finally {
        await dataSource.destroy();
    }
}

seed().catch((error: unknown) => {
    logger.error("Seed failed", error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});
