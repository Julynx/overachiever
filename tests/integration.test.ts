/**
 * @fileoverview End-to-end integration test validating state persistence,
 * streak mechanics, midnight resets, REST endpoints, and WebSocket broadcasting.
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { StateManager } from '../src/services/state_manager.js';
import { AppServer } from '../src/server/app_server.js';
import { FileStorageManager } from '../src/server/file_storage.js';
import { WebSocketMessage } from '../src/types/websocket_events.js';
import { computeLeagueProgress, computeLevelProgress, xpForLevelGap } from '../src/types/progress.js';

async function runIntegrationTests(): Promise<void> {
  console.log('--- Starting Integration Test Suite ---');

  const testTempDir = path.join(process.cwd(), 'data_test');
  if (fs.existsSync(testTempDir)) {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testTempDir, { recursive: true });

  const stateManager = new StateManager(path.join(testTempDir, 'data'));
  stateManager.updateConfig({ port: 3888 });

  const testAchievement = stateManager.createAchievement({
    title: 'Code Machine',
    description: 'Write elegant and tested code all day',
    customCss: '#card-code-machine { border: 1px solid #1ebc73; }',
    imageFileName: 'default_badge.svg',
  });

  if (!testAchievement || testAchievement.title !== 'Code Machine') {
    throw new Error('FAILED: Achievement creation mismatch.');
  }
  console.log('✓ PASS: StateManager createAchievement');

  if (!testAchievement.customCss.includes('#card-code-machine')) {
    throw new Error('FAILED: Custom CSS was not scoped to the card element id.');
  }
  console.log('✓ PASS: Custom CSS scoped to card element id');

  const wrongScopedAchievement = stateManager.createAchievement({
    title: 'Wrong Scope Test',
    description: 'Validates healing of bare-id CSS selectors',
    customCss: '#wrong-scope-test { border: 1px solid #1ebc73; }',
    imageFileName: 'default_badge.svg',
  });
  if (!wrongScopedAchievement.customCss.includes('#card-wrong-scope-test')) {
    throw new Error('FAILED: Bare-id CSS selector was not healed to #card-<id>.');
  }
  console.log('✓ PASS: Bare-id CSS selector healed on creation');
  stateManager.deleteAchievement(wrongScopedAchievement.id);

  const unlockFirst = stateManager.unlockAchievement(testAchievement.id);
  if (!unlockFirst.isNew) {
    throw new Error('FAILED: Initial unlock should be marked as isNew.');
  }
  console.log('✓ PASS: StateManager unlockAchievement');

  const unlockDuplicate = stateManager.unlockAchievement(testAchievement.id);
  if (unlockDuplicate.isNew) {
    throw new Error('FAILED: Duplicate unlock should not be marked as isNew.');
  }
  console.log('✓ PASS: StateManager duplicate unlock ignored');

  const history = stateManager.getHistory();
  const streak = history.streaks[testAchievement.id];
  if (!streak || streak.currentStreak !== 1) {
    throw new Error(`FAILED: Streak should be 1, got: ${streak?.currentStreak}`);
  }
  console.log('✓ PASS: Streak computation recorded 1 day');

  const appServer = new AppServer(stateManager, path.resolve('public'), new FileStorageManager(path.join(testTempDir, 'data', 'images')));
  const serverBinding = await appServer.start();
  console.log(`✓ PASS: AppServer started on port ${serverBinding.port}`);

  const wsClient = new WebSocket(`ws://127.0.0.1:${serverBinding.port}/ws`);
  const receivedEvents: string[] = [];

  await new Promise<void>((resolve, reject) => {
    wsClient.on('open', () => {
      console.log('✓ PASS: WebSocket client connected successfully');
    });

    wsClient.on('message', (data) => {
      const parsed: WebSocketMessage = JSON.parse(data.toString());
      receivedEvents.push(parsed.type);
      if (parsed.type === 'INIT_STATE') {
        resolve();
      }
    });

    wsClient.on('error', reject);
    setTimeout(() => reject(new Error('WebSocket connection timed out')), 5000);
  });

  const getAchievementsRes = await fetch(`http://127.0.0.1:${serverBinding.port}/api/achievements`);
  const achievementsData = await getAchievementsRes.json();
  if (!achievementsData.success || !Array.isArray(achievementsData.data)) {
    throw new Error('FAILED: GET /api/achievements did not return expected array.');
  }
  console.log(`✓ PASS: GET /api/achievements returned ${achievementsData.data.length} achievements`);

  const resetPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Reset WS event timeout')), 3000);
    const handler = (data: any) => {
      const parsed: WebSocketMessage = JSON.parse(data.toString());
      if (parsed.type === 'MIDNIGHT_RESET') {
        clearTimeout(timeout);
        wsClient.off('message', handler);
        resolve();
      }
    };
    wsClient.on('message', handler);
  });

  const resetRes = await fetch(`http://127.0.0.1:${serverBinding.port}/api/reset`, { method: 'POST' });
  const resetData = await resetRes.json();
  if (!resetData.success) {
    throw new Error('FAILED: POST /api/reset unsuccessful.');
  }
  await resetPromise;
  console.log('✓ PASS: POST /api/reset cleared state and broadcasted MIDNIGHT_RESET via WebSocket');

  stateManager.forgetHistory();

  const epicAchievement = stateManager.createAchievement({
    title: 'XP Probe',
    description: 'Validates XP accounting, level curve, and revoke-driven history removal.',
    rarity: 'epic',
  });

  const unlockForXp = stateManager.unlockAchievement(epicAchievement.id);
  if (!unlockForXp.isNew) {
    throw new Error('FAILED: XP probe unlock should be new.');
  }

  const progressAfterUnlock = stateManager.getProgress();
  if (progressAfterUnlock.totalXp !== 4) {
    throw new Error(`FAILED: Epic unlock should award 4 XP, got ${progressAfterUnlock.totalXp}.`);
  }
  if (progressAfterUnlock.level !== 1 || progressAfterUnlock.currentLevelXp !== 4 || progressAfterUnlock.levelXpRequirement !== 20) {
    throw new Error('FAILED: Level progress mismatch after first unlock.');
  }
  if (progressAfterUnlock.elo !== 4 / 5 || progressAfterUnlock.leagueId !== 'iron') {
    throw new Error(`FAILED: ELO/league mismatch, got elo=${progressAfterUnlock.elo} league=${progressAfterUnlock.leagueId}.`);
  }
  console.log('✓ PASS: Unlock awards rarity XP and ELO averages over a 5-day window');

  const streaksAfterUnlock = stateManager.getHistory().streaks;
  const logsAfterUnlock = stateManager.getHistory().logs;
  if (logsAfterUnlock[0].xp !== 4 || streaksAfterUnlock[epicAchievement.id].currentStreak !== 1) {
    throw new Error('FAILED: Log entry did not persist XP or streak was not recorded.');
  }
  console.log('✓ PASS: History log persists XP and streak metrics');

  stateManager.revokeAchievement(epicAchievement.id);
  const historyAfterRevoke = stateManager.getHistory();
  const progressAfterRevoke = stateManager.getProgress();
  if (historyAfterRevoke.logs.some((log) => log.achievementId === epicAchievement.id)) {
    throw new Error('FAILED: Revoke did not remove the unlock from history.');
  }
  if (historyAfterRevoke.streaks[epicAchievement.id] || progressAfterRevoke.totalXp !== 0) {
    throw new Error('FAILED: Revoke did not roll back streak and XP.');
  }
  console.log('✓ PASS: Revoking an achievement removes it from history, streaks, and XP');

  const curveMatchesSpec =
    xpForLevelGap(1) === 20 &&
    xpForLevelGap(10) === 100 &&
    computeLevelProgress(20).level === 2 &&
    computeLevelProgress(19).level === 1;
  if (!curveMatchesSpec) {
    throw new Error('FAILED: Level curve does not match the specification (20 XP at level 1, 100 XP at level 10).');
  }
  console.log('✓ PASS: Non-linear level curve matches specification');

  const fixedDate = '2026-09-16';
  const ladderMatchesSpec =
    computeLeagueProgress({ [fixedDate]: 200 }, fixedDate).league.id === 'cinder' &&
    computeLeagueProgress({ [fixedDate]: 150 }, fixedDate).league.id === 'opal' &&
    computeLeagueProgress({ [fixedDate]: 250 }, fixedDate).league.id === 'cinder' &&
    computeLeagueProgress({ [fixedDate]: 125 }, fixedDate).league.id === 'diamond' &&
    computeLeagueProgress({ [fixedDate]: 20 }, fixedDate).league.id === 'iron';
  if (!ladderMatchesSpec) {
    throw new Error('FAILED: League ladder boundaries mismatch (Opal 30, Cinder 40 as top rank).');
  }
  console.log('✓ PASS: League ladder boundaries match specification (Cinder top at 40 ELO)');

  stateManager.deleteAchievement(epicAchievement.id);

  const forgetRes = await fetch(`http://127.0.0.1:${serverBinding.port}/api/history/forget`, { method: 'POST' });
  const forgetData = await forgetRes.json();
  if (!forgetData.success) {
    throw new Error('FAILED: POST /api/history/forget unsuccessful.');
  }
  const clearedHistory = stateManager.getHistory();
  if (Object.keys(clearedHistory.streaks).length !== 0 || clearedHistory.logs.length !== 0) {
    throw new Error('FAILED: forgetHistory did not clear streaks or logs.');
  }
  console.log('✓ PASS: POST /api/history/forget cleared history and streaks');

  const deleteProbe = stateManager.createAchievement({
    title: 'Delete Probe',
    description: 'Validates that deleting a checked achievement rolls back today like an uncheck.',
    rarity: 'rare',
  });
  stateManager.unlockAchievement(deleteProbe.id);
  if (stateManager.getProgress().totalXp !== 2) {
    throw new Error('FAILED: Rare unlock should award 2 XP before deletion.');
  }
  stateManager.deleteAchievement(deleteProbe.id);
  const sameDayHistory = stateManager.getHistory();
  if (stateManager.getProgress().totalXp !== 0) {
    throw new Error("FAILED: Deleting a checked achievement did not roll back today's XP like an uncheck.");
  }
  if (sameDayHistory.logs.some((log) => log.achievementId === deleteProbe.id) || sameDayHistory.streaks[deleteProbe.id]) {
    throw new Error("FAILED: Deleting a checked achievement left today's unlock in history.");
  }
  if (Object.keys(sameDayHistory.deletedAchievements ?? {}).length !== 0) {
    throw new Error('FAILED: A tombstone was written even though no history remained.');
  }
  if (stateManager.getDailyState().activeUnlocks.some((record) => record.achievementId === deleteProbe.id)) {
    throw new Error('FAILED: Deleting a checked achievement did not uncheck it.');
  }
  console.log("✓ PASS: Deleting a checked achievement unchecks it and rolls back today's XP like a manual uncheck");

  const retroAchievement = stateManager.createAchievement({
    title: 'Retro Probe',
    description: 'Validates that deleting an achievement checked on a prior day preserves history and title.',
    rarity: 'epic',
  });
  stateManager.unlockAchievement(retroAchievement.id);

  const historyFilePath = path.join(testTempDir, 'data', 'history.json');
  const historyOnDisk = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
  const retroLog = historyOnDisk.logs.find((log: { achievementId: string }) => log.achievementId === retroAchievement.id);
  if (!retroLog) {
    throw new Error('FAILED: Retro unlock log missing from history.json.');
  }
  const checkedDate: string = retroLog.calendarDate;
  const previousDay = new Date(`${checkedDate}T00:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const previousDate = previousDay.toISOString().slice(0, 10);
  retroLog.calendarDate = previousDate;
  historyOnDisk.streaks[retroAchievement.id].lastCompletedDate = previousDate;
  fs.writeFileSync(historyFilePath, JSON.stringify(historyOnDisk, null, 2));

  const persistentManager = new StateManager(path.join(testTempDir, 'data'));
  persistentManager.deleteAchievement(retroAchievement.id);

  const preservedHistory = persistentManager.getHistory();
  const preservedProgress = persistentManager.getProgress();
  if (preservedProgress.totalXp !== 4 || preservedProgress.elo !== 4 / 5) {
    throw new Error('FAILED: Deleting a prior-day achievement must not change XP or ELO.');
  }
  if (!preservedHistory.logs.some((log) => log.achievementId === retroAchievement.id && log.calendarDate === previousDate)) {
    throw new Error('FAILED: Prior-day unlock log was removed by deletion.');
  }
  if (preservedHistory.streaks[retroAchievement.id]?.currentStreak !== 1) {
    throw new Error('FAILED: Prior-day streak was removed by deletion.');
  }
  const tombstone = preservedHistory.deletedAchievements?.[retroAchievement.id];
  if (tombstone?.title !== 'Retro Probe' || tombstone?.rarity !== 'epic') {
    throw new Error('FAILED: Deletion did not preserve the achievement title and rarity as a tombstone.');
  }
  console.log('✓ PASS: Deleting a prior-day achievement preserves XP, streaks, and records a title tombstone');

  persistentManager.updateConfig({ port: 3889 });
  const tombstoneServer = new AppServer(persistentManager, path.resolve('public'), new FileStorageManager(path.join(testTempDir, 'data', 'images')));
  const tombstoneBinding = await tombstoneServer.start();
  const tombstoneHistoryRes = await fetch(`http://127.0.0.1:${tombstoneBinding.port}/api/history`);
  const tombstoneHistoryData = await tombstoneHistoryRes.json();
  if (!tombstoneHistoryData.success || tombstoneHistoryData.data.deletedAchievements?.[retroAchievement.id]?.title !== 'Retro Probe') {
    throw new Error('FAILED: GET /api/history did not expose the deletion tombstone.');
  }
  await tombstoneServer.stop();
  console.log('✓ PASS: GET /api/history exposes deleted achievement tombstones');

  stateManager.deleteAchievement(retroAchievement.id);

  stateManager.deleteAchievement(testAchievement.id);
  console.log('✓ PASS: Cleaned up test achievement');

  wsClient.close();
  await appServer.stop();
  console.log('✓ PASS: AppServer stopped cleanly');

  stateManager.updateConfig({ port: 3030 });

  console.log('====================================================');
  console.log('ALL INTEGRATION AND WEBSOCKET TESTS PASSED (100%)');
  console.log('====================================================');
}

runIntegrationTests().catch((testError) => {
  console.error('FATAL TEST FAILURE:', testError);
  process.exit(1);
});
