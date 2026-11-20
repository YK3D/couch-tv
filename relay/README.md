# The family whiteboards' relay

The phones and the TVs meet here, so a phone can draw on the family home's boards from anywhere, not only
on the home Wi-Fi (docs/FAMILY.md). It runs on Cloudflare's free plan as a Worker with one Durable Object
per household, which keeps each TV's four boards. It only carries drawings: it cannot reach the TVs or
anything else at home, and no router port is opened.

- `src/room.js`: the boards and the messages (the same code in Cloudflare and in the local server)
- `src/worker.js`: the Cloudflare side
- `src/dev-server.mjs`: the same relay on this computer, for trying it and for the tests (no TLS, home only)
- `public/`: the phone page

## Putting it up (about 10 minutes, once)

1. A free Cloudflare account (cloudflare.com). No domain is needed: it gets a `workers.dev` address.
2. On the computer, with Node 20 or newer:

   ```sh
   cd relay
   npm install                 # Cloudflare's own tool, wrangler, into relay/node_modules
   npx wrangler login          # opens Cloudflare's sign-in page in the browser
   ```

3. Make two long random keys, one for the phones and one for the TVs:

   ```sh
   python3 -c "import secrets; print(secrets.token_urlsafe(24))"     # the draw key
   python3 -c "import secrets; print(secrets.token_urlsafe(24))"     # the TV key
   npx wrangler secret put DRAW_KEY      # paste the draw key
   npx wrangler secret put TV_KEY        # paste the TV key
   ```

4. `npm run deploy`. It prints the address, for example `https://couch-family.your-name.workers.dev`.
5. Pick a household id (letters, digits, - or _), for example `home1`. To have this relay serve only it,
   add `[vars] HOUSEHOLD = "home1"` to `wrangler.toml` and deploy again.
6. In config.json:

   ```json
   "family": { "relay": { "url": "wss://couch-family.your-name.workers.dev", "household": "home1", "tv_key": "<the TV key>" } }
   ```

7. The family link, for the phones only (never in config.json, never in git):

   ```
   https://couch-family.your-name.workers.dev/#h=home1&k=<the draw key>
   ```

   Send it to each person privately. Opened once, the phone keeps it and takes it out of the address bar.
   Then Add to Home Screen. To shut out an old link, put a new `DRAW_KEY` and send the new link.

## Trying it on this computer first

```sh
DRAW_KEY=draw-test-key TV_KEY=tv-test-key node relay/src/dev-server.mjs 8787
```

The phone page is then `http://<this computer>:8787/#h=home1&k=draw-test-key`, and a TV's config.json
`relay` is `{"url": "ws://<this computer>:8787", "household": "home1", "tv_key": "tv-test-key"}`. Home
network only, kept in memory (gone when it stops).

## Limits

- A board keeps up to 600 strokes (120,000 numbers); the oldest go first. A message is at most 32 KB.
- Up to 8 TVs and 4 people per TV. Names and colours come from each TV's config.json.
- Cloudflare's free plan has daily limits on Durable Objects (developers.cloudflare.com/durable-objects/platform/pricing).
  A family drawing in the evening uses a small part of them; if one is ever reached, drawing stops until
  midnight UTC and the TVs keep showing what they have.
- The TV keeps its last copy of the boards, so they show when the TV comes on even before the relay answers,
  or when the internet is down.
