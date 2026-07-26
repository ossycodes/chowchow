import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { NextFunction, Request, Response } from "express";
import {
  createProxyMiddleware,
  type RequestHandler,
} from "http-proxy-middleware";
import jwt, { type JwtPayload } from "jsonwebtoken";

interface RouteRule {
  prefix: string;
  proxy: RequestHandler;
  /** Whether this request (path + HTTP method) skips auth (login, public browsing, etc). */
  isPublic: (path: string, method: string) => boolean;
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
  private readonly socketProxy: RequestHandler;
  private readonly accessSecret = process.env.JWT_ACCESS_SECRET as string;

  constructor() {
    const identityUrl = process.env.IDENTITY_URL ?? "http://localhost:3001";
    const notificationsUrl =
      process.env.NOTIFICATIONS_URL ?? "http://localhost:3002";
    const catalogUrl = process.env.CATALOG_URL ?? "http://localhost:3003";
    const orderUrl = process.env.ORDER_URL ?? "http://localhost:3004";
    const dispatchUrl = process.env.DISPATCH_URL ?? "http://localhost:3005";
    const paymentsUrl = process.env.PAYMENTS_URL ?? "http://localhost:3006";
    const ledgerUrl = process.env.LEDGER_URL ?? "http://localhost:3007";
    const settlementsUrl =
      process.env.SETTLEMENT_URL ?? "http://localhost:3008";

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
    const catalogProxy = createProxyMiddleware({
      target: catalogUrl,
      changeOrigin: true,
      on: { error: onError },
    });
    const orderProxy = createProxyMiddleware({
      target: orderUrl,
      changeOrigin: true,
      on: { error: onError },
    });
    const dispatchProxy = createProxyMiddleware({
      target: dispatchUrl,
      changeOrigin: true,
      on: { error: onError },
    });
    const paymentsProxy = createProxyMiddleware({
      target: paymentsUrl,
      changeOrigin: true,
      on: { error: onError },
    });
    const ledgerProxy = createProxyMiddleware({
      target: ledgerUrl,
      changeOrigin: true,
      on: { error: onError },
    });
    const settlementsProxy = createProxyMiddleware({
      target: settlementsUrl,
      changeOrigin: true,
      on: { error: onError },
    });
    // Socket.IO (realtime tracking) lives on dispatch. This proxy handles both the HTTP
    // handshake (/socket.io polling) and the WebSocket upgrade. Auth is done by dispatch on
    // the handshake token, so the gateway just forwards — keeping the single front door.
    this.socketProxy = createProxyMiddleware({
      target: dispatchUrl,
      changeOrigin: true,
      ws: true,
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
      {
        // Browsing the catalog (GET) is public; creating/updating (POST/PATCH) needs auth.
        prefix: "/catalog",
        proxy: catalogProxy,
        isPublic: (_p, method) => method === "GET",
      },
      // Orders are always tied to a user — every method requires auth.
      { prefix: "/orders", proxy: orderProxy, isPublic: () => false },
      // Dispatch (rider fleet + assignments) — internal/ops, always authed.
      { prefix: "/dispatch", proxy: dispatchProxy, isPublic: () => false },
      // Payments — read-only view of your charges; always authed.
      { prefix: "/payments", proxy: paymentsProxy, isPublic: () => false },
      // Ledger — finance/ops reporting (double-entry balances + journals); always authed.
      { prefix: "/ledger", proxy: ledgerProxy, isPublic: () => false },
      // Settlements — vendor payouts (ops); always authed.
      { prefix: "/settlements", proxy: settlementsProxy, isPublic: () => false },
      // Socket.IO handshake (polling) → dispatch. The socket authenticates itself via the
      // handshake token, so this HTTP leg is public at the gateway.
      { prefix: "/socket.io", proxy: this.socketProxy, isPublic: () => true },
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

    if (!route.isPublic(path, req.method)) {
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

  /**
   * Handle a raw WebSocket upgrade (wired to the http server's 'upgrade' event in main.ts).
   * Only Socket.IO paths are proxied to dispatch; anything else is closed.
   */
  upgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    if (req.url?.startsWith("/socket.io")) {
      this.socketProxy.upgrade?.(req, socket, head);
    } else {
      socket.destroy();
    }
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
