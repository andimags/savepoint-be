import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Patch,
    Post,
    Request,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
    MinLength,
    ValidateIf,
} from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UsersService } from "./users.service";
import { CloudinaryService } from "./cloudinary.service";

type Req = { user: { userId: string } };

interface UploadedImage {
    buffer: Buffer;
    mimetype: string;
    size: number;
    originalname: string;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
];

class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(20)
    @Matches(/^[a-zA-Z0-9_]+$/, {
        message: "username can only contain letters, numbers, and underscores",
    })
    username?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    displayName?: string;

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsUUID()
    favoriteGameId?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(5)
    @IsUUID("all", { each: true })
    topGameIds?: string[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(8)
    @IsString({ each: true })
    favoriteGenres?: string[];

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(60)
    topFranchise?: string | null;
}

class ChangePasswordDto {
    @IsString()
    currentPassword: string;

    @IsString()
    @MinLength(8)
    newPassword: string;
}

function toMe(user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    favoriteGameId: string | null;
    topGameIds: string[];
    favoriteGenres: string[];
    topFranchise: string | null;
    createdAt: Date;
}) {
    return {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        favoriteGameId: user.favoriteGameId,
        topGameIds: user.topGameIds,
        favoriteGenres: user.favoriteGenres,
        topFranchise: user.topFranchise,
        createdAt: user.createdAt,
    };
}

@Controller("users")
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly cloudinaryService: CloudinaryService,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get("me")
    async me(@Request() req: Req) {
        const user = await this.usersService.findById(req.user.userId);
        if (!user) return null;
        return toMe(user);
    }

    @UseGuards(JwtAuthGuard)
    @Patch("me")
    async updateProfile(@Request() req: Req, @Body() dto: UpdateProfileDto) {
        const user = await this.usersService.updateProfile(
            req.user.userId,
            dto,
        );
        return toMe(user);
    }

    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    @Patch("me/password")
    async changePassword(@Request() req: Req, @Body() dto: ChangePasswordDto) {
        await this.usersService.changePassword(
            req.user.userId,
            dto.currentPassword,
            dto.newPassword,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Post("me/avatar")
    @UseInterceptors(
        FileInterceptor("file", { limits: { fileSize: MAX_AVATAR_BYTES } }),
    )
    async uploadAvatar(
        @Request() req: Req,
        @UploadedFile() file?: UploadedImage,
    ) {
        if (!file) {
            throw new BadRequestException("No image file was provided");
        }
        if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
            throw new BadRequestException(
                "Avatar must be a JPEG, PNG, WebP, or GIF image",
            );
        }
        const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
        const avatarUrl = await this.cloudinaryService.uploadAvatar(
            dataUri,
            req.user.userId,
        );
        const user = await this.usersService.setAvatarUrl(
            req.user.userId,
            avatarUrl,
        );
        return toMe(user);
    }
}
