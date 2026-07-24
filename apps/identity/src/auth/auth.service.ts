import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService, type UserRecord } from "../users/users.service";
import type { LoginRequest } from "../users/dto/login.request";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginRequest): Promise<{ user: UserRecord } & TokenPair> {
    const user = await this.users.verifyCredentials(input.email, input.password);
    if (!user) throw new UnauthorizedException("invalid email or password");
    return { user, ...(await this.issueTokens(user)) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("invalid refresh token");
    }
    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("invalid refresh token");
    }
    const user = await this.users.get(payload.sub);
    if (!user) throw new UnauthorizedException("invalid refresh token");
    return this.issueTokens(user);
  }

  private async issueTokens(user: UserRecord): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.userId,
        actorType: user.actorType,
        email: user.email,
        typ: "access",
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.userId, typ: "refresh" },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: Number(process.env.JWT_REFRESH_TTL ?? 1209600),
      },
    );
    return { accessToken, refreshToken };
  }
}
