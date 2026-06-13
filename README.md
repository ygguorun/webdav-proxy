# webdav-proxy

Vercel project that proxies image requests to a WebDAV server.

## Environment variables

Create `.env.local` and fill in:

- `WEBDAV_URL`: WebDAV base URL, for example `https://example.com/dav`
- `WEBDAV_USERNAME`: WebDAV username
- `WEBDAV_PASSWORD`: WebDAV password
- `WEBDAV_ROOT_PATH`: Root path inside WebDAV, for example `/images`

## Path mapping

Request path `/foo/bar.jpg` maps to:

`{WEBDAV_URL}{WEBDAV_ROOT_PATH}/foo/bar.jpg`

## Commands

- `npm run start`
- `npm run typecheck`
- `npm run deploy`

## Local development

- `npm install`
- Create `.env.local`
- Run `npm run start`
- Visit `http://localhost:3000/<image-path>`

## Behavior

- Only `GET` and `HEAD` are allowed.
- Only successful upstream image responses are returned.
- Upstream non-2xx responses are passed through with their original status.

## Deployment

- Add the four `WEBDAV_*` variables in the Vercel project settings.
- Deploy with `npm run deploy`.
- Requests to `/{path}` are internally rewritten to `api/proxy.ts` via `vercel.json`.

## Notes

- `.env.local` is for local development only.
- Production uses Vercel project environment variables.
