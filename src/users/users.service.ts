import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  create(email: string, username: string, passwordHash: string): Promise<User> {
    const user = this.usersRepository.create({ email, username, passwordHash });
    return this.usersRepository.save(user);
  }

  async updateProfile(
    userId: string,
    updates: {
      displayName?: string | null;
      username?: string;
      favoriteGameId?: string | null;
      topGameIds?: string[];
      favoriteGenres?: string[];
      topFranchise?: string | null;
    },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (updates.username !== undefined && updates.username !== user.username) {
      const taken = await this.usersRepository.findOne({
        where: { username: updates.username, id: Not(userId) },
      });
      if (taken) throw new ConflictException('Username is already taken');
      user.username = updates.username;
    }
    if (updates.displayName !== undefined) {
      user.displayName = updates.displayName?.trim() || null;
    }
    if (updates.favoriteGameId !== undefined) {
      user.favoriteGameId = updates.favoriteGameId || null;
    }
    if (updates.topGameIds !== undefined) {
      user.topGameIds = updates.topGameIds.slice(0, 5);
    }
    if (updates.favoriteGenres !== undefined) {
      user.favoriteGenres = updates.favoriteGenres.slice(0, 8);
    }
    if (updates.topFranchise !== undefined) {
      user.topFranchise = updates.topFranchise?.trim() || null;
    }
    return this.usersRepository.save(user);
  }

  async setAvatarUrl(userId: string, avatarUrl: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.avatarUrl = avatarUrl;
    return this.usersRepository.save(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException('Current password is incorrect');
    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
  }
}
