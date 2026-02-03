import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import "dotenv/config";
import { connect } from "imagelib/schemas";
import { json, urlencoded } from "express";
import fs from "fs";

const SSL_CHECK_INTERVAL_MS = 60000; // Check every 60 seconds

function getFileSignature(filePath: string): string | null {
    try {
        const stats = fs.statSync(filePath);
        const realPath = fs.realpathSync(filePath);
        return `${realPath}:${stats.mtimeMs}:${stats.ino}`;
    } catch {
        return null;
    }
}

function startSslCertificateWatcher(): void {
    const privateKeyPath = process.env.SSL_PRIVATE_KEY_PATH;
    const publicKeyPath = process.env.SSL_PUBLIC_KEY_PATH;

    if (!privateKeyPath || !publicKeyPath) {
        return;
    }

    const initialPrivateKeySig = getFileSignature(privateKeyPath);
    const initialPublicKeySig = getFileSignature(publicKeyPath);

    setInterval(() => {
        const currentPrivateKeySig = getFileSignature(privateKeyPath);
        const currentPublicKeySig = getFileSignature(publicKeyPath);

        if (
            (initialPrivateKeySig !== null && currentPrivateKeySig !== initialPrivateKeySig) ||
            (initialPublicKeySig !== null && currentPublicKeySig !== initialPublicKeySig)
        ) {
            console.log('SSL certificate change detected. Shutting down for restart...');
            process.exit(0);
        }
    }, SSL_CHECK_INTERVAL_MS);
}

async function bootstrap() {
    await connect(process.env.MONGODB_URI);

    const uploadDir = process.env.IMAGE_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const hasHTTPSOptions = process.env.HAS_HTTPS;
    const app = hasHTTPSOptions ? await NestFactory.create(AppModule, {
        httpsOptions: {
            key: fs.readFileSync(process.env.SSL_PRIVATE_KEY_PATH),
            cert: fs.readFileSync(process.env.SSL_PUBLIC_KEY_PATH)
        }
    }) : await NestFactory.create(AppModule);
    app.use(json({ limit: '32mb' }));
    app.use(urlencoded({ extended: true, limit: '32mb' }));
    app.enableCors();

    if (hasHTTPSOptions) {
        startSslCertificateWatcher();
    }

    await app.listen(process.env.PORT || 3120);
}

bootstrap();
