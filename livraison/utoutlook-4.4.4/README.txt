UToutlook Mail 4.4.4 — Installation

1. Transfer utoutlook.mathias_4.4.4_arm64.click to the phone
2. adb install or clickable install

If the app does not open after an update
----------------------------------------
Ubuntu Touch can keep an old application entry in its launcher after several
versions were installed in a row. The app does not start and the splash screen
stays visible. To fix it:

- Reboot the phone, or
- From a terminal on the phone, run:
  gdbus call --session --dest com.lomiri.Shell --object-path /com/lomiri/Shell/Launcher --method com.lomiri.Shell.Launcher.Refresh

No personal information is required for this command.

Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias.
