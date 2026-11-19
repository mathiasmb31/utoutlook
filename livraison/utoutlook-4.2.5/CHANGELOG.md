# UToutlook Mail 4.2.5 — Changelog

This release gathers all fixes made since version 4.1.0. No new setup is
needed: just install the package and open the app from the launcher.

## The app icon and restart are fixed

### 4.2.5: reliable restart after closing the app
After closing the app, the next start could get stuck on the start-up screen
about once in two times. The app now detects a clean quit immediately, before
the phone shell force-stops it, so the "goodbye" notification is always sent
and the next launch starts normally. The app watchdog is unchanged.

The yellow "?" icon and the extra unknown-app icon are gone. The app now uses
the same identity that Lomiri (the Ubuntu Touch launcher) expects, so the
launcher icon, the running-app icon and the window all match. The start-up
animation no longer stays stuck on screen.

## The app window no longer disappears

In some situations the app was still running but its window became invisible.
It is now brought back correctly. When the phone's graphics system fails, the
app also switches to a safer display mode automatically and keeps working.

## Easier sign-in on the phone

A flood of sign-in cookies could make the login screen invisible. This is
fixed. The new buttons in the message list also include a "First install"
shortcut (double-tap) when you need to start over with a clean configuration.

## Clearer buttons

The Ubuntu Touch badge and the two-finger hint are now drawn correctly: the
badge is properly cropped, the "2" is readable, and button labels are no
longer cut off at the edges.

## Packages

- `utoutlook.mathias_4.2.5_arm64.click` — Ubuntu Touch phone (arm64)

Everything from 4.1.0 is included: the Outlook / Microsoft 365 mailbox in a
dedicated full-screen window, new-mail notifications and unread badge.

---

Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias.
