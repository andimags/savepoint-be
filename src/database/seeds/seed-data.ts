import { GamePlatform, GameStatus } from "../../user-games/user-game.entity";

// Static catalog the seed users draw their libraries, diaries and lists from.
// Games are matched/created by name, so re-running the seed reuses existing rows.
export interface SeedGame {
    name: string;
    genres: string[];
    releaseDate: string;
}

export const SEED_GAMES: SeedGame[] = [
    {
        name: "Elden Ring",
        genres: ["RPG", "Action"],
        releaseDate: "2022-02-25",
    },
    {
        name: "The Witcher 3: Wild Hunt",
        genres: ["RPG", "Adventure"],
        releaseDate: "2015-05-19",
    },
    {
        name: "Hades",
        genres: ["Roguelike", "Action", "Indie"],
        releaseDate: "2020-09-17",
    },
    {
        name: "Stardew Valley",
        genres: ["Simulation", "RPG", "Indie"],
        releaseDate: "2016-02-26",
    },
    {
        name: "Hollow Knight",
        genres: ["Metroidvania", "Action", "Indie"],
        releaseDate: "2017-02-24",
    },
    {
        name: "Celeste",
        genres: ["Platformer", "Indie"],
        releaseDate: "2018-01-25",
    },
    {
        name: "Baldur's Gate 3",
        genres: ["RPG", "Strategy"],
        releaseDate: "2023-08-03",
    },
    {
        name: "Cyberpunk 2077",
        genres: ["RPG", "Action", "Shooter"],
        releaseDate: "2020-12-10",
    },
];

export interface SeedLibraryItem {
    gameName: string;
    platform: GamePlatform;
    status: GameStatus;
    playtimeMinutes: number;
    daysSincePlayed: number;
}

export interface SeedDiaryItem {
    gameName: string;
    daysAgo: number;
    platform: string;
    status: GameStatus;
    note: string;
}

export interface SeedList {
    title: string;
    description: string;
    gameNames: string[];
}

export interface SeedUser {
    email: string;
    username: string;
    displayName: string;
    favoriteGameName: string | null;
    topGameNames: string[];
    favoriteGenres: string[];
    topFranchise: string | null;
    library: SeedLibraryItem[];
    diary: SeedDiaryItem[];
    list: SeedList;
}

// Every seed user shares this password for easy local login.
export const SEED_PASSWORD = "password123";

export const SEED_USERS: SeedUser[] = [
    {
        email: "aria@savepoint.dev",
        username: "aria",
        displayName: "Aria Fontaine",
        favoriteGameName: "Elden Ring",
        topGameNames: ["Elden Ring", "Hollow Knight", "Hades"],
        favoriteGenres: ["RPG", "Action"],
        topFranchise: "Dark Souls",
        library: [
            {
                gameName: "Elden Ring",
                platform: GamePlatform.STEAM,
                status: GameStatus.FINISHED,
                playtimeMinutes: 7200,
                daysSincePlayed: 4,
            },
            {
                gameName: "Hollow Knight",
                platform: GamePlatform.NINTENDO,
                status: GameStatus.PLAYING,
                playtimeMinutes: 1500,
                daysSincePlayed: 1,
            },
            {
                gameName: "Hades",
                platform: GamePlatform.STEAM,
                status: GameStatus.FINISHED,
                playtimeMinutes: 3000,
                daysSincePlayed: 12,
            },
        ],
        diary: [
            {
                gameName: "Elden Ring",
                daysAgo: 4,
                platform: "Steam",
                status: GameStatus.FINISHED,
                note: "Finally beat Malenia after way too many attempts.",
            },
            {
                gameName: "Hollow Knight",
                daysAgo: 1,
                platform: "Switch",
                status: GameStatus.PLAYING,
                note: "Getting lost in Deepnest again.",
            },
        ],
        list: {
            title: "Soulslike essentials",
            description: "Games that scratch the same itch as Dark Souls.",
            gameNames: ["Elden Ring", "Hollow Knight", "Hades"],
        },
    },
    {
        email: "kenji@savepoint.dev",
        username: "kenji",
        displayName: "Kenji Sato",
        favoriteGameName: "Baldur's Gate 3",
        topGameNames: ["Baldur's Gate 3", "The Witcher 3: Wild Hunt"],
        favoriteGenres: ["RPG", "Strategy"],
        topFranchise: "The Witcher",
        library: [
            {
                gameName: "Baldur's Gate 3",
                platform: GamePlatform.STEAM,
                status: GameStatus.PLAYING,
                playtimeMinutes: 5400,
                daysSincePlayed: 2,
            },
            {
                gameName: "The Witcher 3: Wild Hunt",
                platform: GamePlatform.GOG,
                status: GameStatus.FINISHED,
                playtimeMinutes: 9000,
                daysSincePlayed: 30,
            },
        ],
        diary: [
            {
                gameName: "Baldur's Gate 3",
                daysAgo: 2,
                platform: "Steam",
                status: GameStatus.PLAYING,
                note: "Act 2 is unbelievably atmospheric.",
            },
            {
                gameName: "The Witcher 3: Wild Hunt",
                daysAgo: 20,
                platform: "GOG",
                status: GameStatus.FINISHED,
                note: "Replayed the Blood and Wine ending. Still perfect.",
            },
            {
                gameName: "Baldur's Gate 3",
                daysAgo: 6,
                platform: "Steam",
                status: GameStatus.PLAYING,
                note: "Recruited every companion I could find.",
            },
        ],
        list: {
            title: "Story-rich RPGs",
            description: "Long campaigns worth every hour.",
            gameNames: ["Baldur's Gate 3", "The Witcher 3: Wild Hunt"],
        },
    },
    {
        email: "mara@savepoint.dev",
        username: "mara",
        displayName: "Mara Lindqvist",
        favoriteGameName: null,
        topGameNames: [],
        favoriteGenres: [],
        topFranchise: null,
        library: [
            {
                gameName: "Stardew Valley",
                platform: GamePlatform.STEAM,
                status: GameStatus.PLAYING,
                playtimeMinutes: 4200,
                daysSincePlayed: 1,
            },
            {
                gameName: "Celeste",
                platform: GamePlatform.STEAM,
                status: GameStatus.FINISHED,
                playtimeMinutes: 900,
                daysSincePlayed: 15,
            },
        ],
        diary: [
            {
                gameName: "Stardew Valley",
                daysAgo: 1,
                platform: "Steam",
                status: GameStatus.PLAYING,
                note: "Year three on the farm, finally turning a profit.",
            },
        ],
        list: {
            title: "Cozy evenings",
            description: "Low-stress games to unwind with.",
            gameNames: ["Stardew Valley", "Celeste"],
        },
    },
    {
        email: "diego@savepoint.dev",
        username: "diego",
        displayName: "Diego Ramos",
        favoriteGameName: null,
        topGameNames: [],
        favoriteGenres: [],
        topFranchise: null,
        library: [
            {
                gameName: "Cyberpunk 2077",
                platform: GamePlatform.EPIC,
                status: GameStatus.PLAYING,
                playtimeMinutes: 2400,
                daysSincePlayed: 3,
            },
            {
                gameName: "Hades",
                platform: GamePlatform.STEAM,
                status: GameStatus.BACKLOG,
                playtimeMinutes: 0,
                daysSincePlayed: 60,
            },
            {
                gameName: "Elden Ring",
                platform: GamePlatform.PLAYSTATION,
                status: GameStatus.DROPPED,
                playtimeMinutes: 600,
                daysSincePlayed: 45,
            },
        ],
        diary: [
            {
                gameName: "Cyberpunk 2077",
                daysAgo: 3,
                platform: "Epic",
                status: GameStatus.PLAYING,
                note: "Phantom Liberty is a huge step up.",
            },
            {
                gameName: "Elden Ring",
                daysAgo: 45,
                platform: "PS5",
                status: GameStatus.DROPPED,
                note: "Bounced off the difficulty for now.",
            },
        ],
        list: {
            title: "On my radar",
            description: "Games I mean to get back to.",
            gameNames: ["Cyberpunk 2077", "Hades", "Elden Ring"],
        },
    },
    {
        email: "priya@savepoint.dev",
        username: "priya",
        displayName: "Priya Nair",
        favoriteGameName: null,
        topGameNames: [],
        favoriteGenres: [],
        topFranchise: "Celeste",
        library: [
            {
                gameName: "Celeste",
                platform: GamePlatform.STEAM,
                status: GameStatus.FINISHED,
                playtimeMinutes: 1200,
                daysSincePlayed: 7,
            },
        ],
        diary: [
            {
                gameName: "Celeste",
                daysAgo: 7,
                platform: "Steam",
                status: GameStatus.FINISHED,
                note: "Cleared the B-sides. My hands hurt.",
            },
            {
                gameName: "Celeste",
                daysAgo: 9,
                platform: "Steam",
                status: GameStatus.PLAYING,
                note: "Chapter 6 took the whole evening.",
            },
        ],
        list: {
            title: "Precision platformers",
            description: "Tight controls, tough challenges.",
            gameNames: ["Celeste"],
        },
    },
];

// A small follow graph so seeded profiles have non-empty follower counts.
export const SEED_FOLLOWS: [
    followerUsername: string,
    followingUsername: string,
][] = [
    ["aria", "kenji"],
    ["aria", "mara"],
    ["kenji", "aria"],
    ["mara", "aria"],
    ["diego", "kenji"],
    ["priya", "aria"],
    ["priya", "mara"],
];
