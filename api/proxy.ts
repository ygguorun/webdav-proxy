import type { VercelRequest, VercelResponse } from "@vercel/node";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_METHODS = new Set(["GET", "HEAD"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ALLOWED_METHODS.has(req.method ?? "")) {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).send("Method Not Allowed");
    return;
  }

  const env = getEnv();
  if (env.missing.length > 0) {
    res.status(500).send(`Missing environment variables: ${env.missing.join(", ")}`);
    return;
  }

  const pathname = getRequestPath(req);
  const search = getForwardSearch(req);
  const upstreamUrl = buildUpstreamUrl(pathname, search, env.values);
  const authorization = `Basic ${encodeBasicAuth(env.values.WEBDAV_USERNAME, env.values.WEBDAV_PASSWORD)}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        Authorization: authorization,
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "User-Agent": "Mozilla/5.0 (compatible; webdav-proxy/1.0; +https://vercel.com)",
      },
      redirect: "follow",
    });

    applyResponseHeaders(res, upstreamResponse.headers);

    if (!upstreamResponse.ok) {
      console.log("Upstream returned non-2xx", {
        method: req.method,
        upstreamUrl,
        status: upstreamResponse.status,
        contentType: upstreamResponse.headers.get("content-type"),
      });

      res.status(upstreamResponse.status);
      const errorBody = await upstreamResponse.text();
      res.send(errorBody);
      return;
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      console.log("Upstream returned non-image content", {
        method: req.method,
        upstreamUrl,
        status: upstreamResponse.status,
        contentType,
      });

      res.status(415).send("Upstream resource is not an image");
      return;
    }

    if (req.method === "HEAD") {
      res.status(upstreamResponse.status).end();
      return;
    }

    const body = Buffer.from(await upstreamResponse.arrayBuffer());
    res.status(upstreamResponse.status).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("Upstream fetch failed", {
      method: req.method,
      upstreamUrl,
      error: message,
    });

    res.status(502).send("Failed to fetch upstream resource");
  }
}

function getEnv() {
  const keys = ["WEBDAV_URL", "WEBDAV_USERNAME", "WEBDAV_PASSWORD", "WEBDAV_ROOT_PATH"] as const;
  const localEnv = loadDotEnvLocal();
  const values = {
    WEBDAV_URL: process.env.WEBDAV_URL ?? localEnv.WEBDAV_URL ?? "",
    WEBDAV_USERNAME: process.env.WEBDAV_USERNAME ?? localEnv.WEBDAV_USERNAME ?? "",
    WEBDAV_PASSWORD: process.env.WEBDAV_PASSWORD ?? localEnv.WEBDAV_PASSWORD ?? "",
    WEBDAV_ROOT_PATH: process.env.WEBDAV_ROOT_PATH ?? localEnv.WEBDAV_ROOT_PATH ?? "",
  };

  const missing = keys.filter((key) => !values[key]);
  return { values, missing };
}

function loadDotEnvLocal(): Partial<Record<EnvKey, string>> {
  const envLocalPath = join(process.cwd(), ".env.local");
  if (!existsSync(envLocalPath)) {
    return {};
  }

  const content = readFileSync(envLocalPath, "utf8");
  const values: Partial<Record<EnvKey, string>> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripOptionalQuotes(line.slice(separatorIndex + 1).trim());
    if (isEnvKey(key)) {
      values[key] = value;
    }
  }

  return values;
}

type EnvKey = "WEBDAV_URL" | "WEBDAV_USERNAME" | "WEBDAV_PASSWORD" | "WEBDAV_ROOT_PATH";

function isEnvKey(value: string): value is EnvKey {
  return value === "WEBDAV_URL" || value === "WEBDAV_USERNAME" || value === "WEBDAV_PASSWORD" || value === "WEBDAV_ROOT_PATH";
}

function stripOptionalQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getRequestPath(req: VercelRequest): string {
  const path = req.query.path;
  if (Array.isArray(path) && path.length > 0) {
    return `/${path.map((segment) => decodeURIComponent(segment)).join("/")}`;
  }

  if (typeof path === "string" && path.length > 0) {
    return `/${decodeURIComponent(path)}`;
  }

  return "/";
}

function getForwardSearch(req: VercelRequest): string {
  const requestUrl = req.url ? new URL(req.url, "http://localhost") : null;
  if (!requestUrl) {
    return "";
  }

  requestUrl.searchParams.delete("path");
  const search = requestUrl.searchParams.toString();
  return search ? `?${search}` : "";
}

function buildUpstreamUrl(
  pathname: string,
  search: string,
  env: { WEBDAV_URL: string; WEBDAV_USERNAME: string; WEBDAV_PASSWORD: string; WEBDAV_ROOT_PATH: string },
): string {
  const baseUrl = env.WEBDAV_URL.replace(/\/+$/, "");
  const rootPath = normalizePath(env.WEBDAV_ROOT_PATH);
  const requestPath = normalizePath(pathname);

  return `${baseUrl}${rootPath}${requestPath}${search}`;
}

function normalizePath(value: string): string {
  if (!value || value === "/") {
    return "";
  }

  const trimmed = value.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}

function applyResponseHeaders(res: VercelResponse, source: Headers) {
  const passthroughHeaders = [
    "content-type",
    "cache-control",
    "etag",
    "last-modified",
    "expires",
    "accept-ranges",
    "content-range",
  ];

  for (const header of passthroughHeaders) {
    const value = source.get(header);
    if (value) {
      res.setHeader(header, value);
    }
  }

  res.setHeader("content-disposition", "inline");
}

function encodeBasicAuth(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}
