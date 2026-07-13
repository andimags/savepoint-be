import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { Review } from "./review.entity";

@Entity("review_likes")
@Index(["userId", "reviewId"], { unique: true })
export class ReviewLike {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @Column()
    reviewId: string;

    @ManyToOne(() => Review, { onDelete: "CASCADE" })
    @JoinColumn({ name: "reviewId" })
    review: Review;

    @CreateDateColumn()
    createdAt: Date;
}
