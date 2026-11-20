# UToutlook Mail 4.3.0 — Changelog

This release gathers all fixes made since version 4.1.0. No new setup is
needed: just install the package and open the app from the launcher.

## The app icon and restart are fixed

### 4.3.0: Catalan and Basque added
Two more languages are available: Catalan and Basque. The app now supports
ten languages in total (French, English, Spanish, German, Italian, Portuguese,
Chinese, Arabic, Catalan, Basque), in the interface and in notifications.
The start-up message and the window display fixes from 4.2.x are included.

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

- `utoutlook.mathias_4.3.0_arm64.click` — Ubuntu Touch phone (arm64)

Everything from 4.1.0 is included: the Outlook / Microsoft 365 mailbox in a
dedicated full-screen window, new-mail notifications and unread badge.

---

Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias.
