# Rounds: v1 job app for NZ gardeners

A barebones, local-only web app. Install it on the Home Screen from the browser. All data stays on the device (localStorage).

## Run locally
```
python3 -m http.server 8250 --directory gardener-app
```
Open http://localhost:8250. The service worker is skipped on localhost, so edits show on reload.

## Files
- `index.html`: shell and nav
- `app.js`: everything else (state, schedule engine, views)
- `styles.css`: high-contrast, large tap targets, print styles for invoices
- `sw.js`: offline cache. **Bump `CACHE` on every release.**
- `wireframe.html`: the original low-fi wireframe

## How the schedule works
A **job** holds the rule (property, price, frequency, start date, optional winter frequency).
**Visits** are generated about 9 weeks ahead. After that, each visit can be moved, done or skipped without changing the job.
Editing a job's frequency or dates rebuilds its upcoming visits. Done visits are never touched.

## Data safety
There's no server, so a lost phone without a backup means the data is lost. Settings → Download backup gives a JSON file, and Restore brings it back.
On iPhone, Safari and the Home Screen app keep **separate** storage. Install the app first, then enter data.
