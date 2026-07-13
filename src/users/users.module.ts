import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { CloudinaryService } from "./cloudinary.service";

@Module({
    imports: [TypeOrmModule.forFeature([User])],
    providers: [UsersService, CloudinaryService],
    controllers: [UsersController],
    exports: [UsersService],
})
export class UsersModule {}
