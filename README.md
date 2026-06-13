# webdav-proxy

Cloudflare Workers project that proxies image requests to a WebDAV server.

## Environment variables

Copy `.dev.vars.example` to `.dev.vars` and fill in:

- `WEBDAV_URL`: WebDAV base URL, for example `https://example.com/dav`
- `WEBDAV_USERNAME`: WebDAV username
- `WEBDAV_PASSWORD`: WebDAV password
- `WEBDAV_ROOT_PATH`: Root path inside WebDAV, for example `/images`

## Path mapping

Request path `/foo/bar.jpg` maps to:

`{WEBDAV_URL}{WEBDAV_ROOT_PATH}/foo/bar.jpg`

## Commands

- `npm run dev`
- `npm run typecheck`
- `npm run deploy`

## Behavior

- Only `GET` and `HEAD` are allowed.
- Only successful upstream image responses are returned.
- Upstream non-2xx responses are passed through with their original status.
