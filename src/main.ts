import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(
        /* whitelist removes properties that aren't part of the DTO ------------------------------------- */
        /* transform converts payloads to be objects typed according to their DTO classes --------------- */
        new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.enableCors({
        origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
        credentials: true,
    });
    await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
