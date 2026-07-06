/**
 * Feedly Cleanup — Full Script (v1.1.0)
 * ======================================
 * Marks articles older than N days as read in your CURRENT Feedly folder.
 *
 * This is the full hosted script, fetched by the bookmarklet bootloader.
 * Because it's hosted, it can be arbitrarily large and auto-updates.
 *
 * Works with ANY Feedly account (Free, Pro, Pro+, Enterprise).
 * Uses your existing login session — no API tokens needed.
 *
 * Hosted at: https://krkeegan.github.io/feedly-read/feedly-cleanup.js
 */

(function () {
  "use strict";

  // ── Version ────────────────────────────────────────────────────────────
  var VERSION = "1.2.0";

  // ── Configuration ──────────────────────────────────────────────────────
  var API_BASE = "https://api.feedly.com/v3";
  var API_PARAMS = "ct=feedly.desktop&cv=31.0.3072";
  var PAGE_SIZE = 100;
  var MARK_BATCH = 200;
  var DELAY_MS = 300;
  var MAX_PAGES = 50;

  // ── Helpers ────────────────────────────────────────────────────────────

  function getToken() {
    try {
      var raw = localStorage.getItem("feedly.session");
      if (!raw) return null;
      return JSON.parse(raw).feedlyToken || null;
    } catch (e) {
      return null;
    }
  }

  function apiHeaders() {
    return {
      Authorization: "Bearer " + getToken(),
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  function apiGet(path) {
    return new Promise(function (resolve, reject) {
      var sep = path.indexOf("?") !== -1 ? "&" : "?";
      var url = API_BASE + path + sep + API_PARAMS;
      fetch(url, { headers: apiHeaders() }).then(function (resp) {
        if (!resp.ok) {
          if (resp.status === 401) return reject(new Error("Session expired — please refresh Feedly and try again."));
          return reject(new Error("HTTP " + resp.status + " from " + path));
        }
        return resp.json().then(resolve);
      }).catch(reject);
    });
  }

  function apiPost(path, body) {
    return new Promise(function (resolve) {
      var sep = path.indexOf("?") !== -1 ? "&" : "?";
      var url = API_BASE + path + sep + API_PARAMS;
      fetch(url, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(body),
      }).then(function (resp) {
        resolve(resp.ok);
      }).catch(function () {
        resolve(false);
      });
    });
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function fmtDate(epochMs) {
    if (!epochMs) return "unknown";
    return new Date(epochMs).toISOString().slice(0, 10);
  }

  // ── UI: Custom Dialog ──────────────────────────────────────────────────

  /** Detect the current folder name from the page URL. */
  function detectCurrentFolder(collections) {
    var m = location.href.match(/\/category\/([^?&#]+)/);
    if (!m) return null;
    var slug = decodeURIComponent(m[1]);
    var match = collections.find(function (c) {
      return (c.id || "").indexOf("/category/" + slug) !== -1;
    });
    return match ? { label: match.label || slug, id: match.id } : null;
  }

  function showDialog(folderLabel) {
    return new Promise(function (resolve) {
      var old = document.getElementById("feedly-cleanup-dialog");
      if (old) old.remove();

      var html =
        '<div id="feedly-cleanup-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
        '<div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:430px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.25);">' +
        '<h2 style="margin:0 0 6px;font-size:20px;color:#111;">🧹 Feedly Cleanup</h2>' +
        '<p style="margin:0 0 6px;font-size:12px;color:#888;">v' + VERSION + ' &middot; auto-updating</p>' +
        '<p style="margin:0 0 16px;padding:10px 12px;background:#f0fdf4;border-radius:7px;font-size:14px;color:#166534;">' +
        'Folder: <strong>' + folderLabel + '</strong></p>' +
        '<label style="display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px;">Mark articles older than</label>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">' +
        '<input id="feedly-cleanup-days" type="number" value="2" min="1" max="365" style="width:80px;padding:9px 12px;border:1px solid #d1d5db;border-radius:7px;font-size:14px;color:#111;">' +
        '<span style="font-size:14px;color:#333;">days</span>' +
        "</div>" +
        '<div id="feedly-cleanup-progress" style="display:none;margin-bottom:16px;padding:12px 14px;background:#f0f9ff;border-radius:8px;font-size:13px;color:#0369a1;line-height:1.5;"></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
        '<button id="feedly-cleanup-cancel" style="padding:9px 20px;border:1px solid #d1d5db;border-radius:7px;background:#fff;font-size:14px;cursor:pointer;color:#333;">Cancel</button>' +
        '<button id="feedly-cleanup-start" style="padding:9px 20px;border:none;border-radius:7px;background:#16a34a;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Start Cleanup</button>' +
        "</div>" +
        "</div>" +
        "</div>";

      document.body.insertAdjacentHTML("beforeend", html);

      var overlay = document.getElementById("feedly-cleanup-overlay");
      var progressEl = document.getElementById("feedly-cleanup-progress");
      var startBtn = document.getElementById("feedly-cleanup-start");
      var cancelBtn = document.getElementById("feedly-cleanup-cancel");
      var daysInput = document.getElementById("feedly-cleanup-days");

      function close() {
        overlay.remove();
        resolve(null);
      }

      cancelBtn.onclick = close;
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close();
      });

      startBtn.onclick = function () {
        var days = parseInt(daysInput.value, 10);
        if (!days || days < 1) {
          daysInput.style.borderColor = "#ef4444";
          return;
        }
        startBtn.disabled = true;
        cancelBtn.disabled = true;
        daysInput.disabled = true;
        startBtn.textContent = "Working...";
        progressEl.style.display = "block";
        resolve({ days: days, progressEl: progressEl, overlay: overlay });
      };
    });
  }

  function showNotOnCategory() {
    return new Promise(function (resolve) {
      var old = document.getElementById("feedly-cleanup-dialog");
      if (old) old.remove();

      var html =
        '<div id="feedly-cleanup-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
        '<div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:430px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.25);">' +
        '<h2 style="margin:0 0 6px;font-size:20px;color:#111;">🧹 Feedly Cleanup</h2>' +
        '<p style="margin:0 0 6px;font-size:12px;color:#888;">v' + VERSION + '</p>' +
        '<div style="padding:16px;background:#fef2f2;border-radius:8px;margin-bottom:20px;font-size:14px;color:#991b1b;line-height:1.6;">' +
        '<strong>No folder detected.</strong><br><br>' +
        'Please navigate to a Feedly category/folder first, then click the bookmark again.' +
        "</div>" +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
        '<button id="feedly-cleanup-close" style="padding:9px 20px;border:none;border-radius:7px;background:#16a34a;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Go to Feedly</button>' +
        "</div>" +
        "</div>" +
        "</div>";

      document.body.insertAdjacentHTML("beforeend", html);

      var overlay = document.getElementById("feedly-cleanup-overlay");

      document.getElementById("feedly-cleanup-close").onclick = function () {
        overlay.remove();
      };

      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) overlay.remove();
      });
    });
  }

  function showResult(overlay, title, message, isError) {
    var content = overlay.querySelector("div > div");
    var bg = isError ? "#fef2f2" : "#f0fdf4";
    var color = isError ? "#991b1b" : "#166534";
    content.innerHTML =
      '<h2 style="margin:0 0 6px;font-size:20px;color:#111;">' + title + "</h2>" +
      '<p style="margin:0 0 6px;font-size:12px;color:#888;">v' + VERSION + "</p>" +
      '<div style="padding:16px;background:' + bg + ";border-radius:8px;margin-bottom:20px;font-size:14px;color:" + color + ';line-height:1.6;">' + message + "</div>" +
      '<div style="text-align:right;">' +
      '<button id="feedly-cleanup-close" style="padding:9px 20px;border:none;border-radius:7px;background:#16a34a;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Close</button>' +
      "</div>";
    document.getElementById("feedly-cleanup-close").onclick = function () {
      overlay.remove();
    };
  }

  function updateProgress(el, msg) {
    if (el) el.textContent = msg;
  }

  // ── Core Logic ─────────────────────────────────────────────────────────

  function fetchOldArticles(streamId, cutoffMs, progressEl) {
    return new Promise(function (resolve) {
      var articles = [];
      var continuation = null;
      var page = 0;

      function nextPage() {
        if (page >= MAX_PAGES) return resolve(articles);
        page++;
        var path = "/streams/contents?streamId=" + encodeURIComponent(streamId) + "&count=" + PAGE_SIZE + "&unreadOnly=true";
        if (continuation) path += "&continuation=" + encodeURIComponent(continuation);

        updateProgress(progressEl, "📖 Scanning page " + page + "...");

        apiGet(path).then(function (data) {
          var items = data.items || [];
          if (!items.length) return resolve(articles);

          var oldest = Infinity;
          for (var i = 0; i < items.length; i++) {
            var ts = items[i].published || items[i].crawled || 0;
            if (ts < oldest) oldest = ts;
            if (ts < cutoffMs) articles.push(items[i]);
          }

          updateProgress(
            progressEl,
            "📖 Page " + page + ": " + items.length + " scanned, " + articles.length + " old found so far..."
          );

          continuation = data.continuation;
          if (!continuation) return resolve(articles);

          sleep(DELAY_MS).then(nextPage);
        }).catch(function (e) {
          updateProgress(progressEl, "⚠️ Error on page " + page + ": " + e.message + ". Stopping.");
          resolve(articles);
        });
      }

      nextPage();
    });
  }

  function markAsRead(entryIds, progressEl) {
    return new Promise(function (resolve) {
      var marked = 0;
      var total = entryIds.length;
      var i = 0;

      function nextBatch() {
        if (i >= total) return resolve(marked);
        var batch = entryIds.slice(i, i + MARK_BATCH);
        var batchNum = Math.floor(i / MARK_BATCH) + 1;
        var totalBatches = Math.ceil(total / MARK_BATCH);

        updateProgress(progressEl, "📝 Marking batch " + batchNum + "/" + totalBatches + " (" + batch.length + " articles)...");

        apiPost("/markers", {
          action: "markAsRead",
          type: "entries",
          entryIds: batch,
        }).then(function (ok) {
          if (ok) marked += batch.length;
          i += MARK_BATCH;
          if (i < total) {
            sleep(DELAY_MS).then(nextBatch);
          } else {
            resolve(marked);
          }
        }).catch(function () {
          i += MARK_BATCH;
          if (i < total) {
            sleep(DELAY_MS).then(nextBatch);
          } else {
            resolve(marked);
          }
        });
      }

      nextBatch();
    });
  }

  // ── Main ──────────────────────────────────────────────────────────────

  function main() {
    var token = getToken();
    if (!token) {
      alert("❌ Not logged into Feedly.\n\nPlease log in at feedly.com and try again.");
      return;
    }

    apiGet("/collections?withStats=true").then(function (collections) {
      // Detect the current folder from the URL
      var detected = detectCurrentFolder(collections);
      if (!detected) {
        showNotOnCategory();
        return;
      }

      showDialog(detected.label).then(function (config) {
        if (!config) return;

        var days = config.days;
        var progressEl = config.progressEl;
        var overlay = config.overlay;

        var streamId = detected.id;
        var folderLabel = detected.label;
        var cutoffMs = Date.now() - days * 86400000;
        var cutoffDate = fmtDate(cutoffMs);

        updateProgress(progressEl, '🔍 Looking for articles in "' + folderLabel + '" older than ' + days + " day(s)...");

        fetchOldArticles(streamId, cutoffMs, progressEl).then(function (oldArticles) {
          if (!oldArticles.length) {
            showResult(
              overlay,
              "All Clean! ✨",
              'No unread articles older than <strong>' + days + " day(s)</strong> found in <strong>" + folderLabel + "</strong>.<br><br>Cutoff: " + cutoffDate,
              false
            );
            return;
          }

          updateProgress(progressEl, "📝 Marking " + oldArticles.length + " articles as read...");

          var entryIds = oldArticles.map(function (a) { return a.id; });

          markAsRead(entryIds, progressEl).then(function (marked) {
            // Find oldest article for display
            var oldestTs = Infinity;
            var oldestTitle = "";
            for (var i = 0; i < oldArticles.length; i++) {
              var ts = oldArticles[i].published || oldArticles[i].crawled || 0;
              if (ts < oldestTs) { oldestTs = ts; oldestTitle = oldArticles[i].title || ""; }
            }

            showResult(
              overlay,
              "Done! 🎉",
              'Marked <strong>' + marked + " of " + oldArticles.length + '</strong> articles as read in "<strong>' + folderLabel + '</strong>".<br><br>' +
                "Cutoff: <strong>" + cutoffDate + "</strong> (" + days + " day(s) ago)<br>" +
                "Oldest marked: <strong>" + fmtDate(oldestTs) + "</strong> — " + (oldestTitle.length > 60 ? oldestTitle.slice(0, 57) + "..." : oldestTitle),
              marked < oldArticles.length
            );
          }).catch(function (e) {
            showResult(overlay, "Error", e.message, true);
          });
        }).catch(function (e) {
          showResult(overlay, "Error", e.message, true);
        });
      });
    }).catch(function (e) {
      alert("❌ Could not connect to Feedly.\n\n" + e.message + "\n\nPlease refresh the page and try again.");
    });
  }

  // ── Entry Point ────────────────────────────────────────────────────────

  console.log("Feedly Cleanup v" + VERSION + " loaded");
  main();
})();
