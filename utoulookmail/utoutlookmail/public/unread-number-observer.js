// Configuration constants
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
let lastUnreadNotificationTime = null;
let lastCalendarNotificationTime = null;
let lastUnreadCount = 0;
let lastReminderCount = 0;
let unreadObserver = null;
let notificationObserver = null;
let retryTimer = null;
let retryDelay = CONFIG.initialRetryDelayMs;

// Helper to create and show notifications using native Electron notifications
const showNotification = (title, body) => {
  debug('showNotification:', { title, body });
  window.electronAPI.showNotification(title, body);
};

const observeUnreadHandlers = {
  outlookWebAppUnread: () => {
    // Find inbox element by semantic attribute (more stable than CSS classes)
    const inboxElement = document.querySelector('[data-folder-name="inbox"]');

    if (!inboxElement) {
      debug('No inbox element found for unread monitoring');
      return false;
    }

    const checkUnread = (checkOnlyZeroUnread) => {
      if (!inboxElement) {
        debug('Invalid inbox element');
        return false;
      }

      // Extract unread count from title attribute: "Inbox - 263 items (217 unread)"
      // Language-agnostic: look for a parenthesized number as the last item
      const title = inboxElement.getAttribute('title');
      let unread = 0;
      if (title) {
        // Match the last parenthesized number in the title (e.g. "(217 unread)" or "(217 non lus)")
        const matches = [...title.matchAll(/\((\d+)\)/g)];
        if (matches.length > 0) {
          unread = parseInt(matches[matches.length - 1][1], 10);
        }
      }

      debug(`Found ${unread} unread message(s)`);

      if (unread > 0 || !checkOnlyZeroUnread) {
        window.electronAPI.updateUnread(unread);

        // Only show notification if unread count increased
        if (unread > lastUnreadCount && !checkOnlyZeroUnread) {
          // Anti-spam: only show notification if enough time has passed
          const now = new Date();
          const timeSinceLastNotification = lastUnreadNotificationTime
            ? now - lastUnreadNotificationTime
            : Infinity;

          if (!lastUnreadNotificationTime || timeSinceLastNotification > CONFIG.unreadEmailThrottleMs) {
            showNotification(
              `${I18N.appName}: ${tr('newMessagesTitle')}`,
              tr('newMessagesBody', { count: unread })
            );
            lastUnreadNotificationTime = now;
          } else {
            debug(`Unread notification suppressed by anti-spam (need to wait ${CONFIG.unreadEmailThrottleMs}ms)`);
          }
        }
      }

      // Update tracked count
      lastUnreadCount = unread;
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
      if (reminderCount > lastReminderCount && !suppressNotification) {
        // Anti-spam: only show notification if enough time has passed
        const now = new Date();
        const timeSinceLastNotification = lastCalendarNotificationTime
          ? now - lastCalendarNotificationTime
          : Infinity;

        if (!lastCalendarNotificationTime || timeSinceLastNotification > CONFIG.calendarReminderThrottleMs) {
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
          lastCalendarNotificationTime = now;
        } else {
          debug(`Calendar notification suppressed by anti-spam (need to wait ${CONFIG.calendarReminderThrottleMs}ms)`);
        }
      }

      // Update tracked count
      lastReminderCount = reminderCount;
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
