/**
 * Custom NSIS install/uninstall hooks for the OverAchiever installer.
 * Included by electron-builder via `nsis.include` in electron-builder.yml.
 *
 * Creates a Scheduled Task ("OverAchiever") launching the app 30 seconds after logon.
 * Must stay in sync with src/main/startup_manager.ts (SCHEDULED_TASK_NAME, PT30S delay).
 * Uses the ScheduledTasks PowerShell module because `schtasks /sc onlogon` demands
 * elevation even for the current user's own logon task.
 *
 * Firewall rules are intentionally NOT managed here: Windows handles the per-executable
 * prompts natively. NSIS string notes: literal '$' is written '$$' and literal ''' is
 * written '$\''.
 */

!include "LogicLib.nsh"

!macro OverAchieverCreateTask
  ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$quote=[char]34; $$exePath=$\'$INSTDIR\OverAchiever.exe$\'; $$action=New-ScheduledTaskAction -Execute ($$quote+$$exePath+$$quote); $$trigger=New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name); $$trigger.Delay=$\'PT30S$\'; $$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; Register-ScheduledTask -TaskName $\'OverAchiever$\' -Action $$action -Trigger $$trigger -Settings $$settings -Force | Out-Null"'
!macroend

!macro OverAchieverRemoveTask
  ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Unregister-ScheduledTask -TaskName $\'OverAchiever$\' -Confirm:$$false -ErrorAction SilentlyContinue"'
!macroend

!macro customInstall
  !insertmacro OverAchieverCreateTask
!macroend

!macro customUnInstall
  !insertmacro OverAchieverRemoveTask
!macroend
