// JWT 签发/验证 + scrypt 密码哈希（Node.js 内置 crypto，无额外依赖）

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";

const scryptAsync = promisify(scrypt);

function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET 未设置或长度不足 32 位，生产环境必须设置");
    }
    return new TextEncoder().encode("dev-secret-change-me-in-production-!!!!");
  }
  return new TextEncoder().encode(raw);
}

/** 签发 JWT，payload.sub 为 userId，默认 7 天有效 */
export async function signToken(userId: string, expiresIn = "7d"): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecret());
}

/** 验证 JWT，返回 userId；无效则抛出 */
export async function verifyToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  if (!payload.sub) throw new Error("token 缺少 sub 字段");
  return payload.sub;
}

/** 使用 scrypt 哈希密码，格式 salt:hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

/** 验证密码与哈希是否匹配 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [salt, hash] = storedHash.split(":");
    if (!salt || !hash) return false;
    const derived = await scryptAsync(password, salt, 64) as Buffer;
    const storedBuf = Buffer.from(hash, "hex");
    if (derived.length !== storedBuf.length) return false;
    return timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}
