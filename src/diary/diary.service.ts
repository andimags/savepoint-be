import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { DiaryEntry } from "./diary-entry.entity";
import { GameStatus } from "../user-games/user-game.entity";

export interface DiaryEntryInput {
    gameId: string;
    playedOn: string;
    platform: string;
    status?: GameStatus | null;
    note?: string | null;
}

@Injectable()
export class DiaryService {
    constructor(
        @InjectRepository(DiaryEntry)
        private readonly diaryRepository: Repository<DiaryEntry>,
    ) {}

    create(userId: string, input: DiaryEntryInput): Promise<DiaryEntry> {
        return this.diaryRepository.save(
            this.diaryRepository.create({
                userId,
                gameId: input.gameId,
                playedOn: input.playedOn,
                platform: input.platform,
                status: input.status ?? null,
                note: input.note ?? null,
            }),
        );
    }

    async update(
        userId: string,
        entryId: string,
        input: Partial<DiaryEntryInput>,
    ): Promise<DiaryEntry> {
        const entry = await this.getOwnEntry(userId, entryId);
        if (input.playedOn !== undefined) entry.playedOn = input.playedOn;
        if (input.platform !== undefined) entry.platform = input.platform;
        if (input.note !== undefined) entry.note = input.note ?? null;
        return this.diaryRepository.save(entry);
    }

    async remove(userId: string, entryId: string): Promise<void> {
        const entry = await this.getOwnEntry(userId, entryId);
        await this.diaryRepository.remove(entry);
    }

    async findPaginated(userId: string, page: number, limit: number) {
        const [items, total] = await this.diaryRepository.findAndCount({
            where: { userId },
            relations: { game: true },
            order: { playedOn: "DESC", createdAt: "DESC" },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        };
    }

    /** Recent diary entries by a set of authors, for the activity feed. */
    findRecentByAuthors(
        authorIds: string[],
        limit: number,
    ): Promise<DiaryEntry[]> {
        return this.diaryRepository.find({
            where: { userId: In(authorIds) },
            relations: { game: true, user: true },
            order: { createdAt: "DESC" },
            take: limit,
        });
    }

    /** Recent diary entries for a single user, for their profile. */
    findRecentForUser(userId: string, limit: number): Promise<DiaryEntry[]> {
        return this.diaryRepository.find({
            where: { userId },
            relations: { game: true },
            order: { playedOn: "DESC", createdAt: "DESC" },
            take: limit,
        });
    }

    private async getOwnEntry(
        userId: string,
        entryId: string,
    ): Promise<DiaryEntry> {
        const entry = await this.diaryRepository.findOne({
            where: { id: entryId },
        });
        if (!entry) throw new NotFoundException("Diary entry not found");
        if (entry.userId !== userId)
            throw new ForbiddenException("Not your diary entry");
        return entry;
    }
}
