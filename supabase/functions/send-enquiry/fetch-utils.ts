import type { Fetcher } from "./types.ts";

const MAXIMUM_PROVIDER_RESPONSE_BYTES = 64 * 1024;

export interface JsonFetchResult {
  response: Response;
  payload: unknown;
}

export async function fetchJsonWithTimeout(
  fetcher: Fetcher,
  input: string | URL | Request,
  init: RequestInit,
  timeoutMilliseconds: number,
): Promise<JsonFetchResult> {
  const controller = new AbortController();
  const timeoutMarker = Symbol("provider-timeout");
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof timeoutMarker>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(timeoutMarker);
    }, timeoutMilliseconds);
  });

  try {
    const pendingResponse = fetcher(input, { ...init, signal: controller.signal });
    const responseResult = await Promise.race([pendingResponse, deadline]);
    if (responseResult === timeoutMarker) {
      throw new DOMException("Provider request timed out", "TimeoutError");
    }

    const response = responseResult;
    if (!response.ok) {
      return { response, payload: null };
    }

    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength && /^\d+$/u.test(declaredLength) &&
      Number(declaredLength) > MAXIMUM_PROVIDER_RESPONSE_BYTES
    ) {
      throw new Error("Provider response was too large");
    }

    if (!response.body) {
      throw new Error("Provider response body was missing");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const pendingRead = reader.read();
        const readResult = await Promise.race([pendingRead, deadline]);
        if (readResult === timeoutMarker) {
          await reader.cancel().catch(() => undefined);
          await pendingRead.catch(() => undefined);
          throw new DOMException("Provider response timed out", "TimeoutError");
        }
        if (readResult.done) {
          break;
        }

        byteLength += readResult.value.byteLength;
        if (byteLength > MAXIMUM_PROVIDER_RESPONSE_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new Error("Provider response was too large");
        }
        chunks.push(readResult.value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { response, payload: JSON.parse(text) as unknown };
  } finally {
    clearTimeout(timeoutId);
  }
}
