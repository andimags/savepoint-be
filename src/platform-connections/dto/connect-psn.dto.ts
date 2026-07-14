import { IsNotEmpty, IsString } from "class-validator";

export class ConnectPsnDto {
    @IsString()
    @IsNotEmpty()
    npsso: string;
}
