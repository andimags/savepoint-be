import { IsNotEmpty, IsString } from "class-validator";

export class ConnectSteamDto {
    @IsString()
    @IsNotEmpty()
    profileUrlOrId: string;
}
