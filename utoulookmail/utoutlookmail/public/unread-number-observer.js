// Configuration constants
const CONFIG = {
  // Anti-spam throttle times
  unreadEmailThrottleMs: 10000,   // 10 seconds between unread email notifications
  calendarReminderThrottleMs: 10000, // 10 seconds between calendar notifications

  // Debounce and polling intervals
  mutationDebounceMs: 1000,          // 1 second debounce for mutation observers
  unreadCheckIntervalMs: 5000,       // 5 seconds between periodic unread checks

  // Retry delays
  handlerRetryDelayMs: 5000,         // 5 seconds before retrying failed handlers
  handlerRetryAgainDelayMs: 10000,   // 10 seconds for subsequent retry attempts

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

let unreadCheckTimer;
let lastUnreadNotificationTime;
let lastCalendarNotificationTime;
let lastUnreadCount = 0;           // Track previous unread count
let lastReminderCount = 0;          // Track previous reminder count

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
    const observer = new MutationObserver(() => {
      debounce(checkUnread, CONFIG.mutationDebounceMs, "unread-mutation");
    });
    observer.observe(leftPanel, {
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
    const observer = new MutationObserver(() => {
      debounce(checkNotifications, CONFIG.mutationDebounceMs, "notification-mutation");
    });
    observer.observe(notificationPane, {
      childList: true,
      subtree: true,
    });

    // Initial check
    checkNotifications(true);

    return true;
  },
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

  // Retry failed handlers after a delay
  if (failedHandlers.length > 0) {
    debug(`Retrying failed handlers in ${CONFIG.handlerRetryDelayMs / 1000} seconds: ${failedHandlers.join(', ')}`);
    setTimeout(() => {
      failedHandlers.forEach(interfaceType => {
        const handler = observeUnreadHandlers[interfaceType];
        const started = handler();
        if (started) {
          debug(`Successfully connected to ${interfaceType} interface on retry`);
        } else {
          debug(`${interfaceType} interface still not ready, will retry again`);
          // Keep retrying
          setTimeout(() => handler(), CONFIG.handlerRetryAgainDelayMs);
        }
      });
    }, CONFIG.handlerRetryDelayMs);
  }

  // If no handlers started at all, retry everything
  if (startedHandlers.length === 0) {
    debug(`No interfaces ready yet, retrying all in ${CONFIG.handlerRetryDelayMs / 1000} seconds...`);
    setTimeout(initializeEmailMonitoring, CONFIG.handlerRetryDelayMs);
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
