import { fetchJsonWithTimeout } from "./fetch-utils.ts";
import type { Fetcher, RateLimiter, RateLimitResult } from "./types.ts";

const SHORT_LIMIT = 5;
const SHORT_WINDOW_MILLISECONDS = 10 * 60 * 1000;
const LONG_LIMIT = 20;
const LONG_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;
const UPSTASH_TIMEOUT_MILLISECONDS = 2_000;

// Both counters are changed in one Redis operation so concurrent requests cannot
// slip between independent short-window and long-window checks.
export const RATE_LIMIT_SCRIPT = `
local shortLimit=tonumber(ARGV[1])
local shortWindow=tonumber(ARGV[2])
local longLimit=tonumber(ARGV[3])
local longWindow=tonumber(ARGV[4])
if not shortLimit or not shortWindow or not longLimit or not longWindow or shortLimit<1 or shortWindow<1 or longLimit<1 or longWindow<1 or shortLimit~=math.floor(shortLimit) or shortWindow~=math.floor(shortWindow) or longLimit~=math.floor(longLimit) or longWindow~=math.floor(longWindow) then
  return redis.error_reply('invalid limiter config')
end
local function hit(key, window)
  local count=redis.call('INCR',key)
  if count==1 then redis.call('PEXPIRE',key,window) end
  local ttl=redis.call('PTTL',key)
  if ttl<0 then redis.call('PEXPIRE',key,window); ttl=window end
  return count,ttl
end
local shortCount,shortTtl=hit(KEYS[1],shortWindow)
local longCount,longTtl=hit(KEYS[2],longWindow)
local allowed=1
local retry=0
if shortCount>shortLimit then allowed=0; retry=shortTtl end
if longCount>longLimit then allowed=0; if longTtl>retry then retry=longTtl end end
if allowed==0 and retry<1 then retry=1 end
return {allowed,retry}
`.trim();

interface UpstashRateLimiterOptions {
  restUrl: string;
  restToken: string;
  ipSalt: string;
  fetcher?: Fetcher;
  timeoutMilliseconds?: number;
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, "0");
  }
  return output;
}

function isUpstashResult(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    value.every((item) => typeof item === "number" && Number.isSafeInteger(item)) &&
    (value[0] === 0 || value[0] === 1) &&
    ((value[0] === 1 && value[1] === 0) || (value[0] === 0 && value[1] > 0));
}

export function createUpstashRateLimiter(
  options: UpstashRateLimiterOptions,
): RateLimiter {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMilliseconds = options.timeoutMilliseconds ??
    UPSTASH_TIMEOUT_MILLISECONDS;
  const encoder = new TextEncoder();
  const hmacKey = crypto.subtle.importKey(
    "raw",
    encoder.encode(options.ipSalt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  async function createIdentifier(clientAddress: string | null): Promise<string> {
    const key = await hmacKey;
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(clientAddress ?? "unknown"),
    );
    return bytesToHex(new Uint8Array(signature));
  }

  return {
    async check(
      clientAddress: string | null,
      _nowMs: number,
    ): Promise<RateLimitResult> {
      try {
        const identifier = await createIdentifier(clientAddress);
        const keyPrefix = `aethera:enquiry:rl:v1:{${identifier}}`;
        const command = [
          "EVAL",
          RATE_LIMIT_SCRIPT,
          2,
          `${keyPrefix}:10m`,
          `${keyPrefix}:24h`,
          SHORT_LIMIT,
          SHORT_WINDOW_MILLISECONDS,
          LONG_LIMIT,
          LONG_WINDOW_MILLISECONDS,
        ];
        const { response, payload } = await fetchJsonWithTimeout(
          fetcher,
          options.restUrl,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${options.restToken}`,
              "Content-Type": "application/json",
              "User-Agent": "AETHERA-Enquiry/1.0",
            },
            body: JSON.stringify(command),
          },
          timeoutMilliseconds,
        );

        if (!response.ok) {
          return { status: "unavailable" };
        }

        if (
          typeof payload !== "object" || payload === null ||
          !("result" in payload) || "error" in payload ||
          !isUpstashResult((payload as { result: unknown }).result)
        ) {
          return { status: "unavailable" };
        }

        const [allowed, retryMilliseconds] = (payload as { result: [number, number] }).result;
        if (allowed === 1) {
          return { status: "allowed" };
        }
        return {
          status: "limited",
          retryAfterSeconds: Math.max(1, Math.ceil(retryMilliseconds / 1000)),
        };
      } catch {
        // A timed-out EVAL may already have executed, so it must not be retried.
        return { status: "unavailable" };
      }
    },
  };
}
