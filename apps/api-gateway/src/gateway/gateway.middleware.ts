import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import {
  createProxyMiddleware,
  type RequestHandler,
} from "http-proxy-middleware";
import jwt, { type JwtPayload } from "jsonwebtoken";

interface RouteRule {
  prefix: string;
  proxy: RequestHandler;
  /** Which exact paths under this prefix skip auth (login/register/etc). */
  isPublic: (path: string) => boolean;
}

/**
 * The single front door. For every request it:
 *  1. resolves which downstream service owns the path (404 if none),
 *  2. strips any client-supplied identity headers (anti-spoofing),
 *  3. for protected routes, verifies the JWT and injects x-user-id / x-actor-type,
 *  4. proxies the request to the downstream service.
 */
@Injectable()
export class GatewayMiddleware implements NestMiddleware {
  private readonly logger = new Logger("Gateway");
  private readonly routes: RouteRule[];
  private readonly accessSecret = process.env.JWT_ACCESS_SECRET as string;

  constructor() {
    const identityUrl = process.env.IDENTITY_URL ?? "http://localhost:3001";
    const notificationsUrl =
      process.env.NOTIFICATIONS_URL ?? "http://localhost:3002";

    const onError = (err: Error, _req: unknown, res: unknown) => {
      this.logger.error(`proxy error: ${err.message}`);
      const response = res as Response;
      if (!response.headersSent) {
        response.status(502).json({
          statusCode: 502,
          error: "Bad Gateway",
          message: "upstream service unavailable",
        });
      }
    };

    const identityProxy = createProxyMiddleware({
      target: identityUrl,
      changeOrigin: true,
      on: { error: onError },
    });
    const notificationsProxy = createProxyMiddleware({
      target: notificationsUrl,
      changeOrigin: true,
      on: { error: onError },
    });

    const publicAuthPaths = new Set([
      "/auth/register",
      "/auth/login",
      "/auth/refresh",
    ]);

    this.routes = [
      {
        prefix: "/auth",
        proxy: identityProxy,
        isPublic: (p) => publicAuthPaths.has(p),
      },
      { prefix: "/users", proxy: identityProxy, isPublic: () => false },
      {
        prefix: "/notifications",
        proxy: notificationsProxy,
        isPublic: () => false,
      },
    ];
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const path = req.path;

    // Let the gateway's own routes (e.g. /health) fall through to Nest.
    if (path === "/health" || path.startsWith("/health/")) return next();

    const route = this.routes.find(
      (r) => path === r.prefix || path.startsWith(`${r.prefix}/`),
    );
    if (!route) {
      res
        .status(404)
        .json({ statusCode: 404, error: "Not Found", message: `no route for ${path}` });
      return;
    }

    // Never trust identity headers from the client — only the gateway may set them.
    delete req.headers["x-user-id"];
    delete req.headers["x-actor-type"];

    if (!route.isPublic(path)) {
      const token = this.extractToken(req);
      if (!token) return this.unauthorized(res, "missing bearer token");
      try {
        const payload = jwt.verify(token, this.accessSecret) as JwtPayload;
        if (payload.typ !== "access") {
          return this.unauthorized(res, "invalid token type");
        }
        req.headers["x-user-id"] = String(payload.sub);
        if (payload.actorType) {
          req.headers["x-actor-type"] = String(payload.actorType);
        }
      } catch {
        return this.unauthorized(res, "invalid or expired token");
      }
    }

    route.proxy(req, res, next);
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice(7);
    return null;
  }

  private unauthorized(res: Response, message: string): void {
    res.status(401).json({ statusCode: 401, error: "Unauthorized", message });
  }
}
