import type { FieldErrors } from "./types.ts";

export const MAX_REQUEST_BODY_BYTES = 16 * 1024;
export const MAX_BODY_READ_MILLISECONDS = 5_000;

export type PublicErrorCode =
  | "INVALID_REQUEST"
  | "SECURITY_CHECK_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type BodyReadResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid_json" | "too_large" | "timeout" };

export function getAllowedOrigin(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins.has(origin) ? origin : null;
}

export function createCorsHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Access-Control-Expose-Headers": "Retry-After",
    "Vary": "Origin",
  });
}

export function createPreflightResponse(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(origin),
  });
}

export function createJsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  additionalHeaders?: HeadersInit,
): Response {
  const headers = origin ? createCorsHeaders(origin) : new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  if (additionalHeaders) {
    new Headers(additionalHeaders).forEach((value, name) => headers.set(name, value));
  }

  return new Response(JSON.stringify(body), { status, headers });
}

export function createErrorResponse(
  status: number,
  code: PublicErrorCode,
  requestId: string,
  origin: string | null,
  options: { fieldErrors?: FieldErrors; headers?: HeadersInit } = {},
): Response {
  const body: Record<string, unknown> = { ok: false, code, requestId };
  if (options.fieldErrors && Object.keys(options.fieldErrors).length > 0) {
    body.fieldErrors = options.fieldErrors;
  }
  return createJsonResponse(body, status, origin, options.headers);
}

export function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0] ?? "";
  return mediaType.trim().toLowerCase() === "application/json";
}

export function hasSupportedContentEncoding(request: Request): boolean {
  const encoding = request.headers.get("content-encoding");
  return encoding === null || encoding.trim().toLowerCase() === "identity";
}

export function declaredBodyIsTooLarge(request: Request): boolean {
  const value = request.headers.get("content-length");
  if (value === null) {
    return false;
  }
  if (!/^\d+$/u.test(value)) {
    return true;
  }
  return Number(value) > MAX_REQUEST_BODY_BYTES;
}

export async function readJsonBody(
  request: Request,
  timeoutMilliseconds = MAX_BODY_READ_MILLISECONDS,
): Promise<BodyReadResult> {
  if (declaredBodyIsTooLarge(request)) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) {
    return { ok: false, reason: "invalid_json" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const timeoutMarker = Symbol("body-read-timeout");
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof timeoutMarker>((resolve) => {
    timeoutId = setTimeout(() => resolve(timeoutMarker), timeoutMilliseconds);
  });

  try {
    while (true) {
      const pendingRead = reader.read();
      const result = await Promise.race([pendingRead, timeout]);
      if (result === timeoutMarker) {
        await reader.cancel().catch(() => undefined);
        await pendingRead.catch(() => undefined);
        return { ok: false, reason: "timeout" };
      }
      const { done, value } = result;
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid_json" };
  } finally {
    clearTimeout(timeoutId);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

export function getClientAddress(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return null;
  }

  const address = (forwardedFor.split(",", 1)[0] ?? "").trim();
  if (address.length === 0 || address.length > 64) {
    return null;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address)) {
    const octets = address.split(".").map(Number);
    if (octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
      return octets.join(".");
    }
    return null;
  }

  if (!address.includes(":") || !/^[0-9A-Fa-f:.]+$/u.test(address)) {
    return null;
  }
  try {
    const hostname = new URL(`http://[${address}]/`).hostname;
    if (!hostname.startsWith("[") || !hostname.endsWith("]")) {
      return null;
    }
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}
