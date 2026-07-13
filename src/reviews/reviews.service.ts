import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './review.entity';
import { ReviewLike } from './review-like.entity';
import { ReviewComment } from './review-comment.entity';
import { Rating } from '../ratings/rating.entity';

export interface ReviewView {
  id: string;
  gameId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; username: string };
  rating: number | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  game?: { id: string; name: string; coverUrl: string | null };
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    @InjectRepository(ReviewLike)
    private readonly likesRepository: Repository<ReviewLike>,
    @InjectRepository(ReviewComment)
    private readonly commentsRepository: Repository<ReviewComment>,
  ) {}

  async create(userId: string, gameId: string, body: string): Promise<Review> {
    return this.reviewsRepository.save(this.reviewsRepository.create({ userId, gameId, body }));
  }

  async update(userId: string, reviewId: string, body: string): Promise<Review> {
    const review = await this.getOwnReview(userId, reviewId);
    review.body = body;
    return this.reviewsRepository.save(review);
  }

  async remove(userId: string, reviewId: string): Promise<void> {
    const review = await this.getOwnReview(userId, reviewId);
    await this.reviewsRepository.remove(review);
  }

  async findForGame(gameId: string, viewerId: string, page: number, limit: number) {
    return this.findViews({ gameId }, viewerId, page, limit, false);
  }

  async findRecent(viewerId: string, page: number, limit: number) {
    return this.findViews({}, viewerId, page, limit, true);
  }

  async findByUser(userId: string, viewerId: string, page: number, limit: number) {
    return this.findViews({ userId }, viewerId, page, limit, true);
  }

  private async findViews(
    where: { gameId?: string; userId?: string },
    viewerId: string,
    page: number,
    limit: number,
    includeGame: boolean,
  ) {
    const qb = this.reviewsRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'author')
      .leftJoinAndMapOne(
        'review.__rating',
        Rating,
        'rating',
        'rating.userId = review.userId AND rating.gameId = review.gameId',
      )
      .orderBy('review.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (includeGame) {
      qb.leftJoinAndSelect('review.game', 'game');
    }
    if (where.gameId) {
      qb.andWhere('review.gameId = :gameId', { gameId: where.gameId });
    }
    if (where.userId) {
      qb.andWhere('review.userId = :userId', { userId: where.userId });
    }

    const [reviews, total] = await qb.getManyAndCount();

    const ids = reviews.map((r) => r.id);
    const [likeCounts, myLikes, commentCounts] = await Promise.all([
      this.countByReview(this.likesRepository, ids),
      ids.length
        ? this.likesRepository.find({ where: ids.map((reviewId) => ({ reviewId, userId: viewerId })) })
        : Promise.resolve([]),
      this.countByReview(this.commentsRepository, ids),
    ]);
    const likedSet = new Set(myLikes.map((l) => l.reviewId));

    const items: ReviewView[] = reviews.map((review) => {
      const withExtras = review as Review & { __rating?: Rating | null };
      return {
        id: review.id,
        gameId: review.gameId,
        body: review.body,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        author: { id: review.user.id, username: review.user.username },
        rating: withExtras.__rating?.value ?? null,
        likeCount: likeCounts.get(review.id) ?? 0,
        likedByMe: likedSet.has(review.id),
        commentCount: commentCounts.get(review.id) ?? 0,
        game: includeGame && review.game
          ? { id: review.game.id, name: review.game.name, coverUrl: review.game.coverUrl }
          : undefined,
      };
    });

    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  private async countByReview(
    repo: Repository<ReviewLike> | Repository<ReviewComment>,
    reviewIds: string[],
  ): Promise<Map<string, number>> {
    if (reviewIds.length === 0) return new Map();
    const rows = await (repo as Repository<ReviewLike>)
      .createQueryBuilder('row')
      .select('row.reviewId', 'reviewId')
      .addSelect('COUNT(*)', 'count')
      .where('row.reviewId IN (:...reviewIds)', { reviewIds })
      .groupBy('row.reviewId')
      .getRawMany<{ reviewId: string; count: string }>();
    return new Map(rows.map((r) => [r.reviewId, Number(r.count)]));
  }

  async like(userId: string, reviewId: string): Promise<void> {
    await this.assertReviewExists(reviewId);
    const existing = await this.likesRepository.findOne({ where: { userId, reviewId } });
    if (!existing) {
      await this.likesRepository.save(this.likesRepository.create({ userId, reviewId }));
    }
  }

  async unlike(userId: string, reviewId: string): Promise<void> {
    await this.likesRepository.delete({ userId, reviewId });
  }

  async addComment(userId: string, reviewId: string, body: string): Promise<ReviewComment> {
    await this.assertReviewExists(reviewId);
    return this.commentsRepository.save(this.commentsRepository.create({ userId, reviewId, body }));
  }

  async findComments(reviewId: string, page: number, limit: number) {
    const [items, total] = await this.commentsRepository.findAndCount({
      where: { reviewId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        author: { id: c.user.id, username: c.user.username },
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async removeComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.commentsRepository.findOne({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException('Not your comment');
    await this.commentsRepository.remove(comment);
  }

  private async getOwnReview(userId: string, reviewId: string): Promise<Review> {
    const review = await this.reviewsRepository.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException('Not your review');
    return review;
  }

  private async assertReviewExists(reviewId: string): Promise<void> {
    const exists = await this.reviewsRepository.exists({ where: { id: reviewId } });
    if (!exists) throw new NotFoundException('Review not found');
  }
}
