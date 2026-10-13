# arena-produit-s.t-mvp — Listing Preflight

Pre-flight checker for Etsy listing CSVs. It finds the rows that would fail or publish badly in a bulk upload (titles over 140 characters, more than 13 tags, tags over 20 characters, bad prices, invalid quantities, duplicate SKUs) and gives you a cleaned file.

The product idea, the evidence behind it, and the GO/KILL criteria are in **[SIGNAL.md](./SIGNAL.md)**. The app here is the concierge/fake-door MVP that tests that idea.

## Run it

Requires Node.js 18.17 or newer. There are no dependencies to install.

```bash
npm start            # http://localhost:3000 (set PORT to change)
npm test             # unit and HTTP tests
npm run queue        # demand signals and open concierge requests
npm run queue -- done someone@example.com   # mark that person's requests done
```

Set `DATA_DIR` to change where the collected JSON lines are written (default `./data`, gitignored).

## What's in the app

| Part | Where | Notes |
|---|---|---|
| Landing page, checker UI, pricing, concierge form | `public/index.html`, `public/app.js`, `public/styles.css` | Static. No framework. |
| CSV parsing | `public/lib/csv.js` | RFC 4180-style, handles quoted fields, BOM, CRLF. |
| Rules engine | `public/lib/preflight.js` | Pure functions. Listing limits live in `LIMITS`, columns in `FIELDS`. |
| HTTP server | `server.js` | Serves `public/`, plus `/api/events`, `/api/waitlist`, `/api/concierge`. |
| Manual fulfilment queue | `scripts/queue.js` | Reads the collected data and lists open requests. |
| Sample file | `public/sample-listings.csv` | Five rows with deliberate errors. |

## Privacy

The CSV is read and checked in the browser. It is not uploaded. The server receives only:

- event names with row counts (for example `check_run` with `rows` and `errorRows`),
- a Pro waitlist email (fake door: nothing is charged),
- a concierge request with email, listing count, and an optional note. Files are sent by email only if the user chooses to.

## Limits

- The limits in `public/lib/preflight.js` are based on Etsy's published guidance. Check them against Etsy's current help pages before relying on the results.
- The checker does not validate categories, shipping profiles, or whether image URLs are reachable.
- Column names are guessed from headers, and the user can change the mapping in the UI.

## Status

Phase: build (concierge MVP). Validation test not yet run. See SIGNAL.md for the plan and the criteria that decide whether to build the paid product.
