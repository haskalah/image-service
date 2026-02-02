import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyModel } from 'imagelib/schemas';
import { IApiKey, hasApiPermission } from 'imagelib';
import crypto from 'crypto';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';

export const RequirePermission = (permission: number) => {
    return (target: any, key?: string, descriptor?: any) => {
        Reflect.defineMetadata(REQUIRED_PERMISSION_KEY, permission, descriptor?.value || target);
        return descriptor || target;
    };
};

export const hashKey = (key: string): string => {
    return crypto.createHash('sha256').update(key).digest('hex');
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key'] as string;

        if (!apiKey) {
            throw new UnauthorizedException('Missing X-API-Key header');
        }

        const hashedKey = hashKey(apiKey);
        const keyRecord = await ApiKeyModel.findOne({ Key: hashedKey, Active: true }) as IApiKey;

        if (!keyRecord) {
            throw new UnauthorizedException('Invalid or inactive API key');
        }

        const requiredPermission = this.reflector.get<number>(
            REQUIRED_PERMISSION_KEY,
            context.getHandler()
        );

        if (requiredPermission && !hasApiPermission(keyRecord.Permissions, requiredPermission)) {
            throw new UnauthorizedException('Insufficient permissions');
        }

        request.apiKey = keyRecord;
        return true;
    }
}
