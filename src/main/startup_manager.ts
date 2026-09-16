/**
 * @fileoverview Manages Windows logon autostart via a Scheduled Task when packaged,
 * falling back to Electron's login-item (HKCU Run key) during development.
 *
 * Uses the ScheduledTasks PowerShell module instead of `schtasks /sc onlogon`
 * because the latter demands elevation even for the current user's own logon task.
 */

import { execFile } from 'node:child_process';
import { app } from 'electron';
import { logger } from '../services/logger.js';

const SCHEDULED_TASK_NAME = 'OverAchiever';
const LOGON_DELAY_ISO = 'PT30S';

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`PowerShell autostart command failed: ${stderr || error.message}`));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

function quotePowerShellSingle(value: string): string {
  return value.replace(/'/g, "''");
}

export class StartupManager {
  /**
   * Reports whether the application is registered to launch at logon.
   * When packaged this awaits a Scheduled Task query; callers should treat it as async.
   */
  public async isEnabled(): Promise<boolean> {
    if (!app.isPackaged) {
      return app.getLoginItemSettings().openAtLogin;
    }
    try {
      const output = await runPowerShell(
        `if (Get-ScheduledTask -TaskName '${SCHEDULED_TASK_NAME}' -ErrorAction SilentlyContinue) { Write-Output 'registered' } else { Write-Output 'missing' }`
      );
      return output === 'registered';
    } catch (queryError) {
      logger.error('Failed to query autostart Scheduled Task', queryError);
      return false;
    }
  }

  /**
   * Registers or removes the logon autostart entry. When packaged this creates a
   * Scheduled Task named "OverAchiever" (matching assets/build/installer.nsh) launching
   * 30 seconds after logon with limited run level; in development it uses Electron's
   * login-item settings instead.
   */
  public async setEnabled(enable: boolean): Promise<void> {
    if (!app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: enable,
        path: process.execPath,
        args: [app.getAppPath()],
      });
      logger.info(`Development login-item autostart set to: ${enable}`);
      return;
    }

    try {
      if (enable) {
        const executablePath = quotePowerShellSingle(process.execPath);
        await runPowerShell(
          [
            `$quote = [char]34`,
            `$action = New-ScheduledTaskAction -Execute ($quote + '${executablePath}' + $quote)`,
            `$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)`,
            `$trigger.Delay = '${LOGON_DELAY_ISO}'`,
            `$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries`,
            `Register-ScheduledTask -TaskName '${SCHEDULED_TASK_NAME}' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null`,
          ].join('; ')
        );
        logger.info(`Scheduled Task "${SCHEDULED_TASK_NAME}" registered for logon autostart.`);
      } else {
        await runPowerShell(
          `Unregister-ScheduledTask -TaskName '${SCHEDULED_TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue`
        );
        logger.info(`Scheduled Task "${SCHEDULED_TASK_NAME}" removed.`);
      }
    } catch (taskError) {
      logger.error(`Failed to update Scheduled Task "${SCHEDULED_TASK_NAME}"`, taskError);
      throw taskError;
    }
  }
}
