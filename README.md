# 🧹 Feedly Cleanup Bookmarklet

Mark articles older than N days as read in your Feedly folders — with **one click**.

Works with **any Feedly account** (Free, Pro, Pro+, Enterprise). No API tokens, no paid plan, no setup.

## Quick Start (30 seconds)

1. **Open** [`index.html`](https://krkeegan.github.io/feedly-read/) in your browser
2. **Drag** the green "Feedly Cleanup" button to your bookmarks bar
3. **Go to** [feedly.com](https://feedly.com) and log in
4. **Click** the bookmark — a dialog appears auto-detecting your folder. Pick days, click **Start Cleanup**

**🔄 Auto-updating:** You'll never need to re-drag the bookmark. It fetches the latest script from GitHub each time.

## How It Works

```
┌───────────────────────────────────────────────────┐
│  1. Bookmark loads bootloader (~180 bytes)        │
├───────────────────────────────────────────────────┤
│  2. Bootloader fetches full script from GitHub    │
│     (cache-busted daily for auto-updates)         │
├───────────────────────────────────────────────────┤
│  3. Script reads your session token from          │
│     localStorage (same as the Feedly app)         │
├───────────────────────────────────────────────────┤
│  4. Shows a styled dialog with folder auto-detect │
├───────────────────────────────────────────────────┤
│  5. Streams unread articles, filters by date      │
├───────────────────────────────────────────────────┤
│  6. Marks old ones as read in batches             │
└───────────────────────────────────────────────────┘
```

Everything runs **entirely in your browser**. No data leaves your machine.

## Files

| File | Description |
|------|-------------|
| `bookmarklet.html` | **Open this** — drag the button to your bookmarks bar |
| `bookmarklet.min.js` | The bootloader bookmarklet (~180 bytes) |
| `feedly-cleanup.js` | The full hosted script (v1.0.0) — auto-updated |

## Architecture

```
bookmarklet.min.js          feedly-cleanup.js
─────────────────          ─────────────────
~180 bytes                   ~350 lines
Never changes                Auto-updates daily
Stored in your bookmarks     Hosted on GitHub
     │                            │
     │  fetch() on click          │
     └───────────────────────────▶│
                                  │
                          Reads localStorage token
                          Calls Feedly API
                          Shows custom dialog
                          Marks articles as read
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| **1.2.0** | 2026-07-06 | Removed re-run guard. Switched to GitHub Pages hosting. |
| **1.1.0** | 2026-07-06 | Initial release |

## FAQ

**Does this work on mobile?**
Most mobile browsers don't support bookmarklets. Use desktop Chrome, Firefox, Edge, or Safari.

**Is this safe?**
I think so. All code is in this repo. It only calls the official Feedly API using your existing login session. Nothing is sent anywhere else.

**Why**
Feedly only provides coarse (all, 1d, 7d) options, I wanted more granularity.

## License

MIT
