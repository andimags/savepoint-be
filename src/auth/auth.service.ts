import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) {}

    async register(email: string, username: string, password: string) {
        if (await this.usersService.findByEmail(email)) {
            throw new ConflictException("Email is already registered");
        }
        if (await this.usersService.findByUsername(username)) {
            throw new ConflictException("Username is already taken");
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await this.usersService.create(
            email,
            username,
            passwordHash,
        );
        return this.signToken(user.id, user.email, user.username);
    }

    async login(email: string, password: string) {
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            throw new UnauthorizedException("Invalid credentials");
        }
        const matches = await bcrypt.compare(password, user.passwordHash);
        if (!matches) {
            throw new UnauthorizedException("Invalid credentials");
        }
        return this.signToken(user.id, user.email, user.username);
    }

    private signToken(userId: string, email: string, username: string) {
        const accessToken = this.jwtService.sign({
            sub: userId,
            email,
            username,
        });
        return { accessToken, user: { id: userId, email, username } };
    }
}
