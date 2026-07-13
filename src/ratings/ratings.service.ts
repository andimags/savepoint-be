import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rating } from './rating.entity';

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingsRepository: Repository<Rating>,
  ) {}

  async upsert(userId: string, gameId: string, value: number): Promise<Rating> {
    const existing = await this.ratingsRepository.findOne({ where: { userId, gameId } });
    if (existing) {
      existing.value = value;
      return this.ratingsRepository.save(existing);
    }
    return this.ratingsRepository.save(this.ratingsRepository.create({ userId, gameId, value }));
  }

  async remove(userId: string, gameId: string): Promise<void> {
    await this.ratingsRepository.delete({ userId, gameId });
  }

  async summary(gameId: string, userId: string) {
    const raw = await this.ratingsRepository
      .createQueryBuilder('rating')
      .select('AVG(rating.value)', 'average')
      .addSelect('COUNT(*)', 'count')
      .where('rating.gameId = :gameId', { gameId })
      .getRawOne<{ average: string | null; count: string }>();

    const own = await this.ratingsRepository.findOne({ where: { userId, gameId } });

    return {
      average: raw?.average ? Number(Number(raw.average).toFixed(2)) : null,
      count: Number(raw?.count ?? 0),
      userRating: own?.value ?? null,
    };
  }

  findByUser(userId: string): Promise<Rating[]> {
    return this.ratingsRepository.find({ where: { userId } });
  }
}
