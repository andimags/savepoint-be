import { Repository } from "typeorm";

/** Subset of `Repository<T>` methods commonly stubbed in unit tests. */
export type MockRepository<T extends object = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
>;

/** Chainable query-builder mock covering the builder calls used across services. */
export interface MockQueryBuilder {
    select: jest.Mock;
    addSelect: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    leftJoinAndMapOne: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    groupBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getRawOne: jest.Mock;
    getRawMany: jest.Mock;
    getManyAndCount: jest.Mock;
}

export function createMockQueryBuilder(): MockQueryBuilder {
    const builder = {} as MockQueryBuilder;
    const chainable: (keyof MockQueryBuilder)[] = [
        "select",
        "addSelect",
        "leftJoinAndSelect",
        "leftJoinAndMapOne",
        "where",
        "andWhere",
        "orderBy",
        "groupBy",
        "skip",
        "take",
    ];
    for (const method of chainable) {
        builder[method] = jest.fn().mockReturnValue(builder);
    }
    builder.getRawOne = jest.fn();
    builder.getRawMany = jest.fn().mockResolvedValue([]);
    builder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    return builder;
}

/** Creates a jest-mocked `Repository<T>` with every method stubbed as a jest.fn(). */
export function createMockRepository<
    T extends object = any,
>(): MockRepository<T> {
    return {
        find: jest.fn(),
        findOne: jest.fn(),
        findAndCount: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        exists: jest.fn(),
        createQueryBuilder: jest.fn(),
    };
}
