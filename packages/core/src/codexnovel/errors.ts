import type { CodexNovelErrorCode } from "./types";

export class CodexNovelError extends Error {
  readonly code: CodexNovelErrorCode;
  readonly httpStatus?: number;
  readonly retryAfterSec?: number;

  constructor(
    code: CodexNovelErrorCode,
    message: string,
    options?: { httpStatus?: number; retryAfterSec?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CodexNovelError";
    this.code = code;
    this.httpStatus = options?.httpStatus;
    this.retryAfterSec = options?.retryAfterSec;
  }
}

export function mapHttpStatusToCode(status: number, apiCode?: string): CodexNovelErrorCode {
  const normalized = (apiCode || "").toUpperCase();
  const known: CodexNovelErrorCode[] = [
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "REGISTER_DISABLED",
    "RATE_LIMITED",
    "INTERNAL",
  ];
  if (known.includes(normalized as CodexNovelErrorCode)) {
    return normalized as CodexNovelErrorCode;
  }
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL";
  return "INTERNAL";
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const asInt = Number.parseInt(header, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    const sec = Math.ceil((dateMs - Date.now()) / 1000);
    return Math.max(0, sec);
  }
  return undefined;
}
