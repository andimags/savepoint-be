/* eslint-disable @typescript-eslint/unbound-method -- passing jest.Mocked methods to expect() is safe */
import { Test, TestingModule } from "@nestjs/testing";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

describe("AuthController", () => {
    let controller: AuthController;
    let authService: jest.Mocked<AuthService>;

    const authResult = {
        accessToken: "signed-jwt",
        user: { id: "user-1", email: "player@example.com", username: "player_one" },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [
                {
                    provide: AuthService,
                    useValue: {
                        register: jest.fn().mockResolvedValue(authResult),
                        login: jest.fn().mockResolvedValue(authResult),
                    },
                },
            ],
        }).compile();

        controller = module.get(AuthController);
        authService = module.get(AuthService);
    });

    it("delegates registration to AuthService with the DTO fields", async () => {
        const dto: RegisterDto = {
            email: "player@example.com",
            username: "player_one",
            password: "password123",
        };

        const result = await controller.register(dto);

        expect(authService.register).toHaveBeenCalledWith(
            dto.email,
            dto.username,
            dto.password,
        );
        expect(result).toEqual(authResult);
    });

    it("delegates login to AuthService with the DTO fields", async () => {
        const dto: LoginDto = {
            email: "player@example.com",
            password: "password123",
        };

        const result = await controller.login(dto);

        expect(authService.login).toHaveBeenCalledWith(dto.email, dto.password);
        expect(result).toEqual(authResult);
    });
});
