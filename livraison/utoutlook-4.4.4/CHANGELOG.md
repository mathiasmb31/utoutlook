# UToutlook Mail 4.4.4 — Release notes

This release focuses on reliability when closing and reopening the app.

- Fixed: a delayed close event could leave the app running with no visible window. The next launch then stayed on the splash screen.
- Fixed: closing the app now really quits it, so Ubuntu Touch starts a fresh session every time.
- Fixed: after installing several versions in a row, the launcher could keep an old app entry and refuse to start the app. Installs now refresh the launcher automatically.
- New: a file from other Ubuntu Touch apps can be attached from the message list toolbar.
- Privacy: no mail is stored locally, the app keeps no password or encryption key, and there is no analytics. The optional diagnostics report contains only technical status.

Tested on Fairphone 5 with Ubuntu Touch framework 24.04. Other devices and releases may behave differently.

Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias.
