import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { List } from "./list.entity";
import { ListItem } from "./list-item.entity";
import { ListsService } from "./lists.service";
import { ListsController } from "./lists.controller";

@Module({
    imports: [TypeOrmModule.forFeature([List, ListItem])],
    providers: [ListsService],
    controllers: [ListsController],
    exports: [ListsService],
})
export class ListsModule {}
