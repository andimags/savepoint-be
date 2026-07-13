import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DiaryEntry } from "./diary-entry.entity";
import { DiaryService } from "./diary.service";
import { DiaryController } from "./diary.controller";

@Module({
    imports: [TypeOrmModule.forFeature([DiaryEntry])],
    providers: [DiaryService],
    controllers: [DiaryController],
    exports: [DiaryService],
})
export class DiaryModule {}
