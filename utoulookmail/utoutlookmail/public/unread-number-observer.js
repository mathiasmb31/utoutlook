// Wrap in IIFE to prevent "Identifier already declared" errors on re-injection.
// executeJavaScript runs in global scope — top-level const/let would conflict.
(() => {
const CONFIG = {
  // Anti-spam throttle times
  unreadEmailThrottleMs: 10000,   // 10 seconds between unread email notifications
  calendarReminderThrottleMs: 10000, // 10 seconds between calendar notifications

  // Debounce and polling intervals
  mutationDebounceMs: 1000,          // 1 second debounce for mutation observers
  unreadCheckIntervalMs: 5000,       // 5 seconds between periodic unread checks

  // Retry delays — exponential backoff, capped at maxRetryDelayMs
  initialRetryDelayMs: 3000,         // 3 seconds before first retry
  maxRetryDelayMs: 30000,            // 30 seconds max between retries

  // Debug logging (set to true to enable verbose console output)
  debug: true,
};

// Debug logger — silent by default
const debug = (...args) => { if (CONFIG.debug) console.log(...args); };

// i18n: translations injected by the main process
const I18N = window.__utoutlookI18n || {
  newMessagesTitle: 'New Messages',
  newMessagesBody: '{count} unread message(s)',
  newMailTitle: 'New mail',
  newMailBody: '{sender}: {subject}',
  newMailBodyNoSubject: '{sender} (no subject)',
  calendarTitle: '{count} Calendar Reminder(s)',
  appName: 'UToutlook Mail',
};

function tr(key, vars) {
  let str = I18N[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
    }
  }
  return str;
}

// ============================================================
// Cleanup: remove all previous observers, timers, and flags
// This prevents duplicates when the script is re-injected
// (dom-ready, did-navigate-in-page, did-stop-loading, health check)
// ============================================================
if (window.__utoutlookObserverCleanup) {
  window.__utoutlookObserverCleanup();
}

// State — module-level so cleanup can access it
let unreadCheckTimer = null;
let unreadObserver = null;
let notificationObserver = null;
let retryTimer = null;
let retryDelay = CONFIG.initialRetryDelayMs;
// v3.3.22: un handler qui échoue 5× de suite est déclaré mort (ex: interface
// interne outlookWebAppUnread supprimée par Microsoft) — sinon retry infini
// qui spam les logs et bouffe du CPU (vu: "Failed to connect" toutes les 3s).
const handlerFailCount = {};
const deadHandlers = {};

// Persistent state across re-injections.
// The observer script is re-injected on dom-ready, did-navigate-in-page,
// did-stop-loading, and by the health check (every 10s). Without persistence,
// lastUnreadCount resets to 0 on each re-injection, causing false "new message"
// notifications when the user has unread mail (5 > 0 triggers a notification).
// Storing in window.__utoutlookState survives re-injection.
if (!window.__utoutlookState) {
  window.__utoutlookState = {
    lastUnreadCount: 0,
    lastReminderCount: 0,
    lastUnreadNotificationTime: null,
    lastCalendarNotificationTime: null,
    // Confirmation counter for zero-unread: when unread drops to 0 while
    // previously > 0, we require two consecutive zero readings before
    // updating lastUnreadCount. Prevents false notifications caused by
    // temporary "(0 unread)" titles during SPA re-renders.
    zeroUnreadConfirmCount: 0,
    // Debounce timer for updateUnread badge updates
    updateUnreadTimer: null,
  };
}
const state = window.__utoutlookState;

// Helper to create and show notifications using native Electron notifications
const showNotification = (title, body) => {
  // Always log to console — captured by the main process console-message handler
  console.log('[UTOUTLOOK NOTIF]', title, '|', body);
  debug('showNotification:', { title, body });
  window.electronAPI.showNotification(title, body);
};

// Debounced updateUnread: prevents badge flickering when the unread count
// fluctuates temporarily during SPA re-renders. The badge only updates
// after the value has been stable for 2 seconds.
// Timer persists in window.__utoutlookState across re-injections.
const updateUnreadDebounced = (unread) => {
  if (state.updateUnreadTimer) {
    clearTimeout(state.updateUnreadTimer);
  }
  state.updateUnreadTimer = setTimeout(() => {
    state.updateUnreadTimer = null;
    window.electronAPI.updateUnread(unread);
    debug(`updateUnread(${unread}) sent after debounce`);
  }, 2000);
};

const observeUnreadHandlers = {
  outlookWebAppUnread: () => {
    // Find inbox element by semantic attribute (more stable than CSS classes)
    // NOTE: use let, not const — Outlook SPA recreates this element on navigation,
    // so we must re-query on every check to avoid reading a stale (disconnected)
    // element that retains its old title with the old unread count.
    // Outlook a changé son DOM au fil du temps — on essaie plusieurs sélecteurs.
    const findInboxElement = () => {
      // Sélecteurs par ordre de préférence (du plus sémantique au plus générique)
      const selectors = [
        '[data-folder-name="inbox"]',
        '[data-folder-name="Boîte de réception"]',
        '[data-folder-name="Inbox"]',
        // v3.3.21: nouveau DOM — le treeitem de la boîte de réception a un title
        // "Boîte de réception - éléments N (M non lus)" mais plus de parent
        // FolderPane (volet de navigation replié/rendu ailleurs).
        '[role="treeitem"][title*="non lus" i]',
        '[role="treeitem"][title*="unread" i]',
        '[role="treeitem"][aria-label*="non lus" i]',
        '[role="treeitem"][aria-label*="unread" i]',
        '[data-app-section="FolderPane"] [role="treeitem"][aria-label*="non lu" i]',
        '[data-app-section="FolderPane"] [role="treeitem"][aria-label*="unread" i]',
        '[class*="folderPane"] [role="treeitem"][title*="non lu" i]',
        '[class*="folderPane"] [role="treeitem"][title*="unread" i]',
        '[class*="folderPane"] [role="treeitem"]:first-child',
        '[data-folder-pane] [role="treeitem"]:first-child',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && document.contains(el)) {
          debug(`Inbox found with selector: ${sel}`);
          return el;
        }
      }
      // Dernier recours: chercher un treeitem avec un title contenant un nombre entre parenthèses
      const allTreeItems = document.querySelectorAll('[role="treeitem"][title*="("]');
      for (const item of allTreeItems) {
        const title = item.getAttribute('title') || '';
        if (/\(\d+\)/.test(title) && /inbox|réception|reception/i.test(title)) {
          debug(`Inbox found by title pattern: ${title.substring(0, 80)}`);
          return item;
        }
      }
      debug('No inbox element found — tried ' + selectors.length + ' selectors');
      return null;
    };

    let inboxElement = findInboxElement();

    if (!inboxElement) {
      console.log('[UTOUTLOOK OBSERVER] No inbox element found for unread monitoring');
      // v3.3.21: alert when the Outlook DOM changes and our selectors no longer
      // match (we had found the inbox before, now nothing matches) — urgent
      // notification so it is shown even when the app is in the foreground.
      state.domFailCount = (state.domFailCount || 0) + 1;
      if (state.hadInbox && state.domFailCount >= 2 && !state.domAlerted) {
        state.domAlerted = true;
        console.error('[UTOUTLOOK OBSERVER] DOM CHANGED — inbox selectors no longer match');
        try {
          window.electronAPI.showNotification(
            I18N.appName || 'UToutlook Mail',
            'DOM Outlook modifié — les sélecteurs de l\'observer ne correspondent plus (non lus indisponibles)',
            null,
            true // urgent
          );
        } catch (e) { /* ignore */ }
      }
      return false;
    }
    console.log('[UTOUTLOOK OBSERVER] Inbox element found — unread monitoring active');
    state.domFailCount = 0;
    state.hadInbox = true;
    state.domAlerted = false;

    // ============================================================
    // Extract info from the latest (first) message in the list
    // Used to include subject + sender in new-mail notifications
    // ============================================================
    const getLatestMailInfo = () => {
      try {
        // Sélecteurs pour le premier message (le plus récent) dans la liste
        const firstMessageSelectors = [
          '[role="list"] [role="listitem"]:first-child',
          '[class*="messageList"] [role="row"]:first-child',
          '[class*="listView"] [role="row"]:first-child',
          '[class*="messageItem"]:first-child',
          '[role="grid"] [role="row"]:first-child',
        ];
        let firstMsg = null;
        for (const sel of firstMessageSelectors) {
          firstMsg = document.querySelector(sel);
          if (firstMsg) break;
        }
        if (!firstMsg) {
          debug('No first message element found for subject extraction');
          return null;
        }

        // Sélecteurs pour le sujet dans le message
        const subjectSelectors = [
          '[class*="subject"]',
          '[data-automation-id*="subject"]',
          '[class*="messageSubject"]',
          '[class*="itemSubject"]',
        ];
        let subject = '';
        for (const sel of subjectSelectors) {
          const el = firstMsg.querySelector(sel);
          if (el && el.textContent.trim()) {
            subject = el.textContent.trim();
            break;
          }
        }

        // Sélecteurs pour l'expéditeur dans le message
        const senderSelectors = [
          '[class*="sender"]',
          '[class*="from"]',
          '[data-automation-id*="sender"]',
          '[class*="displayName"]',
        ];
        let sender = '';
        for (const sel of senderSelectors) {
          const el = firstMsg.querySelector(sel);
          if (el && el.textContent.trim()) {
            sender = el.textContent.trim();
            break;
          }
        }

        // Fallback: utiliser le texte du premier message (tronqué)
        if (!subject && firstMsg.textContent) {
          subject = firstMsg.textContent.trim().substring(0, 80);
        }
        if (!sender && firstMsg.textContent) {
          // Essayer d'extraire la première ligne (souvent l'expéditeur)
          const lines = firstMsg.textContent.trim().split('\n').filter(l => l.trim());
          if (lines.length > 0) sender = lines[0].trim().substring(0, 40);
        }

        debug(`Latest mail info: sender="${sender}" subject="${subject}"`);
        return { subject, sender };
      } catch (e) {
        debug('Error extracting latest mail info:', e.message);
        return null;
      }
    };

    const checkUnread = (checkOnlyZeroUnread) => {
      // Re-query on every check: Outlook SPA recreates DOM nodes during navigation.
      // A stale (disconnected) element keeps its old title attribute, causing
      // false reads (e.g. old unread=5 when real count is now 4 → false notification).
      const currentInbox = findInboxElement();
      if (!currentInbox || !document.contains(currentInbox)) {
        // v4.0.4: read the unread count from document.title first — Outlook
        // web always puts "(N unread)" / "(N non lus)" in the page title, even
        // when the navigation pane is closed. No DOM toggle needed.
        const docTitle = document.title || '';
        const titleMatches = [...docTitle.matchAll(/\((\d+)[^)]*\)/g)];
        if (titleMatches.length > 0) {
          const docUnread = parseInt(titleMatches[0][1], 10);
          debug(`Unread read from document.title: ${docUnread} ("${docTitle.substring(0, 60)}")`);
          // Feed the same pipeline as a real inbox read: reuse by faking a
          // minimal path — simplest is to handle it inline below.
          state.navToggleForRead = null;
          state.navToggleCount = 0;
          // Inline handling equivalent to the found-inbox path for the count.
          const prev = state.lastUnreadCount;
          if (docUnread === 0 && prev > 0) {
            state.zeroUnreadConfirmCount++;
            if (state.zeroUnreadConfirmCount < 2) {
              debug(`Zero unread pending confirmation (${state.zeroUnreadConfirmCount}/2)`);
              return false;
            }
            state.zeroUnreadConfirmCount = 0;
          } else {
            state.zeroUnreadConfirmCount = 0;
          }
          state.lastUnreadCount = docUnread;
          if (!checkOnlyZeroUnread) updateUnreadDebounced(docUnread);
          if (docUnread > prev && !checkOnlyZeroUnread) {
            const now = new Date();
            const since = state.lastUnreadNotificationTime ? now - state.lastUnreadNotificationTime : Infinity;
            if (!state.lastUnreadNotificationTime || since > CONFIG.unreadEmailThrottleMs) {
              const mailInfo = getLatestMailInfo();
              let title, body;
              if (mailInfo && mailInfo.subject) {
                title = tr('newMailTitle');
                body = tr('newMailBody', { sender: mailInfo.sender || '', subject: mailInfo.subject });
              } else {
                title = `${I18N.appName}: ${tr('newMessagesTitle')}`;
                body = tr('newMessagesBody', { count: docUnread });
              }
              showNotification(title, body);
              state.lastUnreadNotificationTime = now;
            }
          }
          return true;
        }
        // v3.3.25: the inbox treeitem only exists when the navigation pane is
        // open. Fallback: toggle it open for one check, read the count on the
        // next tick, then toggle it back — invisible for the user.
        // v4.0.4: capped (max 3 toggles per episode + 60s cooldown) — an
        // uncapped toggle loop (click → mutation → observer → check → click)
        // re-renders the Outlook DOM forever and freezes the renderer.
        const nowMs = Date.now();
        if (state.navToggleCooldownUntil && nowMs < state.navToggleCooldownUntil) {
          debug('Nav pane toggle on cooldown — skipping check');
          return false;
        }
        if (!state.navToggleForRead) {
          state.navToggleCount = (state.navToggleCount || 0) + 1;
          if (state.navToggleCount > 3) {
            state.navToggleCooldownUntil = nowMs + 60000;
            state.navToggleCount = 0;
            debug('Nav pane toggle limit reached (3) — cooldown 60s');
            return false;
          }
          const btn = [...document.querySelectorAll('button,[role="button"]')]
            .find(b => /volet de navigation|navigation pane/i.test(b.getAttribute('aria-label') || ''));
          if (btn) {
            state.navToggleForRead = btn;
            btn.click();
            debug('Nav pane toggled open to read unread count');
          }
        } else {
          const btn = state.navToggleForRead;
          state.navToggleForRead = null;
          if (btn && document.contains(btn)) btn.click(); // toggle back closed
          debug('Nav pane toggled back closed');
        }
        debug('Inbox element not found or disconnected — skipping check');
        return false;
      }
      state.navToggleForRead = null; // inbox found — make sure pane state is clean
      // Update reference for future checks
      inboxElement = currentInbox;

      // Extract unread count from title attribute: "Inbox - 263 items (217 unread)"
      // Language-agnostic: look for a parenthesized number as the last item
      const title = inboxElement.getAttribute('title');
      let unread = 0;
      let titleValid = false;
      if (title) {
        // Match the last parenthesized number in the title, e.g. "(217 unread)",
        // "(217 non lus)", "(217)" — v3.3.21: the count may be followed by text
        // inside the parens, so accept anything up to the closing paren.
        const matches = [...title.matchAll(/\((\d+)[^)]*\)/g)];
        if (matches.length > 0) {
          unread = parseInt(matches[matches.length - 1][1], 10);
          titleValid = true;
        }
      }

      // If the title is missing or has no parseable count, the DOM is likely
      // mid-render (SPA navigation between folders/messages). Skip this check
      // entirely — do NOT update state.lastUnreadCount, otherwise a temporary
      // 0 would cause a false "new message" notification when the title returns.
      if (!titleValid) {
        debug('Title missing or unparseable — skipping check (DOM mid-render?)');
        return false;
      }

      debug(`Found ${unread} unread message(s)`);

      // Capture the previous tracked count BEFORE any update below.
      // The "did unread increase?" comparison further down must use this
      // previous value — hotfix #9 updated the tracked count before
      // comparing, so the increase test was always false and new-mail
      // notifications never fired (fixed in hotfix #11).
      const previousUnreadCount = state.lastUnreadCount;

      // Update tracked count.
      // When unread drops to 0 while previously > 0, require two consecutive
      // zero readings before updating — prevents false "new message"
      // notifications when a SPA re-render temporarily shows "(0 unread)"
      // and then reverts to the real count (e.g. 5 > 0 → false notification).
      let zeroPendingConfirmation = false;
      if (unread === 0 && previousUnreadCount > 0) {
        state.zeroUnreadConfirmCount++;
        if (state.zeroUnreadConfirmCount >= 2) {
          state.lastUnreadCount = 0;
          state.zeroUnreadConfirmCount = 0;
          debug('Zero unread confirmed (2 consecutive readings)');
        } else {
          debug(`Zero unread pending confirmation (${state.zeroUnreadConfirmCount}/2) — not updating lastUnreadCount`);
          zeroPendingConfirmation = true;
        }
      } else {
        state.zeroUnreadConfirmCount = 0;
        state.lastUnreadCount = unread;
      }

      // Update the launcher badge (debounced to prevent flickering during
      // SPA re-renders). Skip badge update for unconfirmed zeros — if this
      // is a temporary "(0 unread)" from a re-render, the badge would
      // flicker to 0 and back, which the user perceives as an envelope
      // notification appearing/disappearing.
      if (unread > 0 || !checkOnlyZeroUnread) {
        if (!(unread === 0 && zeroPendingConfirmation)) {
          updateUnreadDebounced(unread);
        }

        // Only show notification if unread count increased.
        // Compare against previousUnreadCount (captured above, before the
        // update) — NOT state.lastUnreadCount, which now equals unread and
        // would make this comparison always false (hotfix #11).
        if (unread > previousUnreadCount && !checkOnlyZeroUnread) {
          // Anti-spam: only show notification if enough time has passed
          const now = new Date();
          const timeSinceLastNotification = state.lastUnreadNotificationTime
            ? now - state.lastUnreadNotificationTime
            : Infinity;

          if (!state.lastUnreadNotificationTime || timeSinceLastNotification > CONFIG.unreadEmailThrottleMs) {
            // Essayer d'extraire le sujet du dernier mail pour une notif plus riche
            const mailInfo = getLatestMailInfo();
            let title, body;
            if (mailInfo && mailInfo.subject) {
              title = tr('newMailTitle');
              const sender = mailInfo.sender || '';
              body = tr('newMailBody', { sender, subject: mailInfo.subject });
            } else if (mailInfo && mailInfo.sender) {
              title = tr('newMailTitle');
              body = tr('newMailBodyNoSubject', { sender: mailInfo.sender });
            } else {
              title = `${I18N.appName}: ${tr('newMessagesTitle')}`;
              body = tr('newMessagesBody', { count: unread });
            }
            showNotification(title, body);
            state.lastUnreadNotificationTime = now;
          } else {
            debug(`Unread notification suppressed by anti-spam (need to wait ${CONFIG.unreadEmailThrottleMs}ms)`);
          }
        }
      }
    };

    // Find the navigation pane using semantic attribute (more stable than CSS classes)
    const navigationPane = document.querySelector('[data-app-section="NavigationPane"]');
    const leftPanel = navigationPane?.querySelector('#folderPaneDroppableContainer');

    if (!leftPanel) {
      debug('Navigation panel not found for mutation observer');
      return false;
    }

    debug('Successfully found inbox element and navigation panel');

    // Observe for DOM changes
    unreadObserver = new MutationObserver(() => {
      debounce(checkUnread, CONFIG.mutationDebounceMs, "unread-mutation");
    });
    unreadObserver.observe(leftPanel, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    // Timer to catch zero unread changes that observer might miss
    if (unreadCheckTimer) {
      clearInterval(unreadCheckTimer);
    }
    unreadCheckTimer = setInterval(() => {
      checkUnread(true);
    }, CONFIG.unreadCheckIntervalMs);

    // Initial check
    checkUnread();

    return true;
  },

  outlookWebAppNotifications: () => {
    // Find notification pane by semantic attribute (more stable than CSS classes)
    const notificationPane = document.querySelector('[data-app-section="NotificationPane"]');

    if (!notificationPane) {
      debug('No notification pane found for calendar reminders');
      return false;
    }

    debug('Successfully found notification pane');

    const checkNotifications = (suppressNotification = false) => {
      if (!notificationPane) {
        debug('Invalid notification pane element');
        return false;
      }

      // Query directly for reminder elements within the notification pane
      // More stable than using intermediate container class
      const reminderElements = notificationPane.querySelectorAll('[reminder]');
      const reminderCount = reminderElements.length;

      debug(`Found ${reminderCount} calendar reminder(s)`);

      // Only show notification if reminder count increased
      if (reminderCount > state.lastReminderCount && !suppressNotification) {
        // Anti-spam: only show notification if enough time has passed
        const now = new Date();
        const timeSinceLastNotification = state.lastCalendarNotificationTime
          ? now - state.lastCalendarNotificationTime
          : Infinity;

        if (!state.lastCalendarNotificationTime || timeSinceLastNotification > CONFIG.calendarReminderThrottleMs) {
          const reminderDetails = [];
          reminderElements.forEach((reminder) => {
            const subject = reminder.getAttribute('subject') || 'Reminder';
            const timeDisplay = reminder.getAttribute('starttimedisplaystring') || '';
            const timeUntil = reminder.getAttribute('timeuntildisplaystring') || '';
            const location = reminder.getAttribute('location') || '';

            let details = subject;
            if (timeDisplay) details += ` at ${timeDisplay}`;
            if (timeUntil) details += ` (${timeUntil})`;
            if (location) details += ` - ${location}`;

            reminderDetails.push(details);
          });

          debug('Showing calendar notification:', reminderDetails);
          showNotification(
            `${I18N.appName}: ${tr('calendarTitle', { count: reminderCount })}`,
            reminderDetails.join('\n')
          );
          state.lastCalendarNotificationTime = now;
        } else {
          debug(`Calendar notification suppressed by anti-spam (need to wait ${CONFIG.calendarReminderThrottleMs}ms)`);
        }
      }

      // Update tracked count
      state.lastReminderCount = reminderCount;
    };

    // Observe for DOM changes
    notificationObserver = new MutationObserver(() => {
      debounce(checkNotifications, CONFIG.mutationDebounceMs, "notification-mutation");
    });
    notificationObserver.observe(notificationPane, {
      childList: true,
      subtree: true,
    });

    // Initial check
    checkNotifications(true);

    return true;
  },
};

// ============================================================
// Cleanup function — exposed globally so re-injection can clean up
// ============================================================
window.__utoutlookObserverCleanup = () => {
  debug('Cleaning up previous observer instance');
  if (unreadObserver) { unreadObserver.disconnect(); unreadObserver = null; }
  if (notificationObserver) { notificationObserver.disconnect(); notificationObserver = null; }
  if (unreadCheckTimer) { clearInterval(unreadCheckTimer); unreadCheckTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (state.updateUnreadTimer) { clearTimeout(state.updateUnreadTimer); state.updateUnreadTimer = null; }
  window.__utoutlookObserverActive = false;
};

const initializeEmailMonitoring = () => {
  debug('init monitor');
  const startedHandlers = [];
  const failedHandlers = [];

  for (const interfaceType in observeUnreadHandlers) {
    if (deadHandlers[interfaceType]) continue; // v3.3.22: dead after 5 failures
    const handler = observeUnreadHandlers[interfaceType];
    const started = handler();

    if (started) {
      handlerFailCount[interfaceType] = 0;
      debug(`Successfully connected to ${interfaceType} interface`);
      startedHandlers.push(interfaceType);
    } else {
      handlerFailCount[interfaceType] = (handlerFailCount[interfaceType] || 0) + 1;
      if (handlerFailCount[interfaceType] >= 5) {
        deadHandlers[interfaceType] = true;
        debug(`Giving up on ${interfaceType} after 5 failures (interface removed by Outlook?)`);
      } else {
        debug(`Failed to connect to ${interfaceType} interface (${handlerFailCount[interfaceType]}/5)`);
      }
      failedHandlers.push(interfaceType);
    }
  }

  // Mark observer as active if at least one handler connected
  if (startedHandlers.length > 0) {
    window.__utoutlookObserverActive = true;
    // Reset backoff on success
    retryDelay = CONFIG.initialRetryDelayMs;
    debug(`Observer active (${startedHandlers.length} handler(s) connected)`);
  } else {
    window.__utoutlookObserverActive = false;
  }

  // Retry failed handlers with exponential backoff — but NOT forever:
  // v3.3.22 dead handlers (5 consecutive failures) are excluded from the retry.
  const retryable = failedHandlers.filter(f => !deadHandlers[f]);
  if (retryable.length > 0 || (startedHandlers.length === 0 && Object.keys(deadHandlers).length < Object.keys(observeUnreadHandlers).length)) {
    const currentDelay = retryDelay;
    debug(`Retrying in ${currentDelay / 1000}s (failed: ${retryable.join(', ') || 'all'})`);
    retryTimer = setTimeout(() => {
      // Exponential backoff: double the delay, capped at max
      retryDelay = Math.min(retryDelay * 2, CONFIG.maxRetryDelayMs);
      initializeEmailMonitoring();
    }, currentDelay);
  } else {
    // All handlers connected — schedule a full re-check as a safety net
    // (in case the SPA re-renders and kills our observers)
    retryTimer = setTimeout(() => {
      debug('Periodic full re-check of observer connectivity');
      initializeEmailMonitoring();
    }, 60000); // every 60 seconds
  }
};

const debounce = (() => {
  const timers = {};

  return (callback, wait, id = "default") => {
    if (timers[id]) {
      clearTimeout(timers[id]);
    }
    timers[id] = setTimeout(callback, wait);
  };
})();

debug('init monitor');
initializeEmailMonitoring();
})(); // end IIFE
