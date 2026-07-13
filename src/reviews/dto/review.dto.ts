import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReviewBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  body: string;
}

export class CommentBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;
}
