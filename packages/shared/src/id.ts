import { randomBytes } from "node:crypto";

/** Collision-resistant id generator (crypto-random). */
export function newId(prefix = "dik"): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
}

export function newSessionId(): string {
  return newId("sess");
}

export function newMessageId(): string {
  return newId("msg");
}

export function newRequestId(): string {
  return newId("req");
}