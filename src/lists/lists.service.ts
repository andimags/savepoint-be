import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { List } from './list.entity';
import { ListItem } from './list-item.entity';

@Injectable()
export class ListsService {
  constructor(
    @InjectRepository(List)
    private readonly listsRepository: Repository<List>,
    @InjectRepository(ListItem)
    private readonly itemsRepository: Repository<ListItem>,
  ) {}

  create(userId: string, title: string, description: string | null): Promise<List> {
    return this.listsRepository.save(this.listsRepository.create({ userId, title, description }));
  }

  async update(userId: string, listId: string, title: string, description: string | null): Promise<List> {
    const list = await this.getOwnList(userId, listId);
    list.title = title;
    list.description = description;
    return this.listsRepository.save(list);
  }

  async remove(userId: string, listId: string): Promise<void> {
    const list = await this.getOwnList(userId, listId);
    await this.listsRepository.remove(list);
  }

  async findByUser(userId: string) {
    const lists = await this.listsRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
    const counts = await this.itemCounts(lists.map((l) => l.id));
    return lists.map((list) => ({ ...list, itemCount: counts.get(list.id) ?? 0 }));
  }

  /** Recently created lists across all users, for the global activity feed. */
  async findRecentGlobal(limit: number) {
    const lists = await this.listsRepository.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const counts = await this.itemCounts(lists.map((l) => l.id));
    return lists.map((list) => ({
      id: list.id,
      title: list.title,
      description: list.description,
      itemCount: counts.get(list.id) ?? 0,
      createdAt: list.createdAt,
      owner: { id: list.user.id, username: list.user.username },
    }));
  }

  async findOne(listId: string) {
    const list = await this.listsRepository.findOne({
      where: { id: listId },
      relations: { user: true },
    });
    if (!list) throw new NotFoundException('List not found');
    const items = await this.itemsRepository.find({
      where: { listId },
      relations: { game: true },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    return {
      id: list.id,
      title: list.title,
      description: list.description,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      owner: { id: list.user.id, username: list.user.username },
      items: items.map((item) => ({
        id: item.id,
        position: item.position,
        game: item.game,
      })),
    };
  }

  async addItem(userId: string, listId: string, gameId: string): Promise<ListItem> {
    await this.getOwnList(userId, listId);
    const existing = await this.itemsRepository.findOne({ where: { listId, gameId } });
    if (existing) return existing;
    const max = await this.itemsRepository
      .createQueryBuilder('item')
      .select('COALESCE(MAX(item.position), -1)', 'max')
      .where('item.listId = :listId', { listId })
      .getRawOne<{ max: string }>();
    return this.itemsRepository.save(
      this.itemsRepository.create({ listId, gameId, position: Number(max?.max ?? -1) + 1 }),
    );
  }

  async removeItem(userId: string, listId: string, itemId: string): Promise<void> {
    await this.getOwnList(userId, listId);
    await this.itemsRepository.delete({ id: itemId, listId });
  }

  private async itemCounts(listIds: string[]): Promise<Map<string, number>> {
    if (listIds.length === 0) return new Map();
    const rows = await this.itemsRepository
      .createQueryBuilder('item')
      .select('item.listId', 'listId')
      .addSelect('COUNT(*)', 'count')
      .where('item.listId IN (:...listIds)', { listIds })
      .groupBy('item.listId')
      .getRawMany<{ listId: string; count: string }>();
    return new Map(rows.map((r) => [r.listId, Number(r.count)]));
  }

  private async getOwnList(userId: string, listId: string): Promise<List> {
    const list = await this.listsRepository.findOne({ where: { id: listId } });
    if (!list) throw new NotFoundException('List not found');
    if (list.userId !== userId) throw new ForbiddenException('Not your list');
    return list;
  }
}
