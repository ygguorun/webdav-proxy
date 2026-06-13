interface Env {
  WEBDAV_URL: string;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  WEBDAV_ROOT_PATH: string;
}

const ALLOWED_METHODS = new Set(["GET", "HEAD"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const missingEnv = [
      "WEBDAV_URL",
      "WEBDAV_USERNAME",
      "WEBDAV_PASSWORD",
      "WEBDAV_ROOT_PATH",
    ].filter((key) => !env[key as keyof Env]);

    if (missingEnv.length > 0) {
      return new Response(`Missing environment variables: ${missingEnv.join(", ")}`, {
        status: 500,
      });
    }

    const url = new URL(request.url);
    const upstreamUrl = buildUpstreamUrl(url.pathname, env);
    const authorization = `Basic ${btoa(`${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`)}`;

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: { Authorization: authorization },
      redirect: "follow",
    });

    if (!upstreamResponse.ok) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: copyResponseHeaders(upstreamResponse.headers),
      });
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new Response("Upstream resource is not an image", { status: 415 });
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: copyResponseHeaders(upstreamResponse.headers),
    });
  },
};

function buildUpstreamUrl(pathname: string, env: Env): string {
  const baseUrl = env.WEBDAV_URL.replace(/\/+$/, "");
  const rootPath = normalizePath(env.WEBDAV_ROOT_PATH);
  const requestPath = normalizePath(pathname);

  return `${baseUrl}${rootPath}${requestPath}`;
}

function normalizePath(value: string): string {
  if (!value || value === "/") {
    return "";
  }

  const trimmed = value.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}

function copyResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  const passthroughHeaders = [
    "content-type",
    "content-length",
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
      headers.set(header, value);
    }
  }

  return headers;
}
