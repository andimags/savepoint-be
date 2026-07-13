import { Module } from "@nestjs/common";
import { RawgApiService } from "./rawg-api.service";

@Module({
    providers: [RawgApiService],
    exports: [RawgApiService],
})
export class RawgModule {}
