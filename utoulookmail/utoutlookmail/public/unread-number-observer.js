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
  debug: false,
};

// Debug logger — silent by default
const debug = (...args) => { if (CONFIG.debug) console.log(...args); };

// i18n: translations injected by the main process
const I18N = window.__utoutlookI18n || {
  newMessagesTitle: 'New Messages',
  newMessagesBody: '{count} unread message(s)',
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
  };
}
const state = window.__utoutlookState;

// Helper to create and show notifications using native Electron notifications
const showNotification = (title, body) => {
  debug('showNotification:', { title, body });
  window.electronAPI.showNotification(title, body);
};

const observeUnreadHandlers = {
  outlookWebAppUnread: () => {
    // Find inbox element by semantic attribute (more stable than CSS classes)
    // NOTE: use let, not const — Outlook SPA recreates this element on navigation,
    // so we must re-query on every check to avoid reading a stale (disconnected)
    // element that retains its old title with the old unread count.
    let inboxElement = document.querySelector('[data-folder-name="inbox"]');

    if (!inboxElement) {
      debug('No inbox element found for unread monitoring');
      return false;
    }

    const checkUnread = (checkOnlyZeroUnread) => {
      // Re-query on every check: Outlook SPA recreates DOM nodes during navigation.
      // A stale (disconnected) element keeps its old title attribute, causing
      // false reads (e.g. old unread=5 when real count is now 4 → false notification).
      const currentInbox = document.querySelector('[data-folder-name="inbox"]');
      if (!currentInbox || !document.contains(currentInbox)) {
        debug('Inbox element not found or disconnected — skipping check');
        return false;
      }
      // Update reference for future checks
      inboxElement = currentInbox;

      // Extract unread count from title attribute: "Inbox - 263 items (217 unread)"
      // Language-agnostic: look for a parenthesized number as the last item
      const title = inboxElement.getAttribute('title');
      let unread = 0;
      let titleValid = false;
      if (title) {
        // Match the last parenthesized number in the title (e.g. "(217 unread)" or "(217 non lus)")
        const matches = [...title.matchAll(/\((\d+)\)/g)];
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

      if (unread > 0 || !checkOnlyZeroUnread) {
        window.electronAPI.updateUnread(unread);

        // Only show notification if unread count increased
        if (unread > state.lastUnreadCount && !checkOnlyZeroUnread) {
          // Anti-spam: only show notification if enough time has passed
          const now = new Date();
          const timeSinceLastNotification = state.lastUnreadNotificationTime
            ? now - state.lastUnreadNotificationTime
            : Infinity;

          if (!state.lastUnreadNotificationTime || timeSinceLastNotification > CONFIG.unreadEmailThrottleMs) {
            showNotification(
              `${I18N.appName}: ${tr('newMessagesTitle')}`,
              tr('newMessagesBody', { count: unread })
            );
            state.lastUnreadNotificationTime = now;
          } else {
            debug(`Unread notification suppressed by anti-spam (need to wait ${CONFIG.unreadEmailThrottleMs}ms)`);
          }
        }
      }

      // Update tracked count.
      // When unread drops to 0 while previously > 0, require two consecutive
      // zero readings before updating — prevents false "new message"
      // notifications when a SPA re-render temporarily shows "(0 unread)"
      // and then reverts to the real count (e.g. 5 > 0 → false notification).
      if (unread === 0 && state.lastUnreadCount > 0) {
        state.zeroUnreadConfirmCount++;
        if (state.zeroUnreadConfirmCount >= 2) {
          state.lastUnreadCount = 0;
          state.zeroUnreadConfirmCount = 0;
          debug('Zero unread confirmed (2 consecutive readings)');
        } else {
          debug(`Zero unread pending confirmation (${state.zeroUnreadConfirmCount}/2) — not updating lastUnreadCount`);
          // Still update the badge so the UI reflects current state
          return;
        }
      } else {
        state.zeroUnreadConfirmCount = 0;
        state.lastUnreadCount = unread;
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
  window.__utoutlookObserverActive = false;
};

const initializeEmailMonitoring = () => {
  debug('init monitor');
  const startedHandlers = [];
  const failedHandlers = [];

  for (const interfaceType in observeUnreadHandlers) {
    const handler = observeUnreadHandlers[interfaceType];
    const started = handler();

    if (started) {
      debug(`Successfully connected to ${interfaceType} interface`);
      startedHandlers.push(interfaceType);
    } else {
      debug(`Failed to connect to ${interfaceType} interface`);
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

  // Retry failed handlers with exponential backoff — never give up.
  // Outlook is a SPA that can take 30s+ to render on slow devices.
  if (failedHandlers.length > 0 || startedHandlers.length === 0) {
    const currentDelay = retryDelay;
    debug(`Retrying in ${currentDelay / 1000}s (failed: ${failedHandlers.join(', ') || 'all'})`);
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
