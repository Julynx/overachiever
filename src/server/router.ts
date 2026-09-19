/**
 * @fileoverview Express API router providing REST endpoints for achievement CRUD,
 * daily unlocks, image uploads, streaks, and reset actions.
 */

import * as os from 'node:os';
import { Router, Request, Response, NextFunction } from 'express';
import { StateManager } from '../services/state_manager.js';
import { FileStorageManager } from './file_storage.js';
import { logger } from '../services/logger.js';

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  const candidates: { name: string; address: string; isVirtual: boolean }[] = [];

  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];
    if (!addresses) continue;
    for (const net of addresses) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        const lowerName = name.toLowerCase();
        const isVirtual =
          lowerName.includes('vethernet') ||
          lowerName.includes('wsl') ||
          lowerName.includes('virtual') ||
          lowerName.includes('hyper-v') ||
          lowerName.includes('vmware') ||
          lowerName.includes('docker');

        candidates.push({ name, address: net.address, isVirtual });
      }
    }
  }

  const physical = candidates.find((c) => !c.isVirtual);
  if (physical) {
    return physical.address;
  }

  return candidates.length > 0 ? candidates[0].address : 'localhost';
}

export function createApiRouter(
  stateManager: StateManager,
  fileStorageManager: FileStorageManager
): Router {
  const router = Router();
  const uploader = fileStorageManager.createMulterUploader();

  router.get('/achievements', (_request: Request, response: Response) => {
    const list = stateManager.getAllAchievements();
    response.json({ success: true, data: list });
  });

  router.post('/achievements', (request: Request, response: Response, next: NextFunction) => {
    try {
      const payload = request.body;
      if (!payload.title || !payload.description) {
        response.status(400).json({ success: false, error: 'Title and description are required.' });
        return;
      }
      const created = stateManager.createAchievement(payload);
      response.status(201).json({ success: true, data: created });
    } catch (creationError) {
      next(creationError);
    }
  });

  router.put('/achievements/:id', (request: Request, response: Response, next: NextFunction) => {
    try {
      const id = String(request.params.id);
      const updated = stateManager.updateAchievement(id, request.body);
      response.json({ success: true, data: updated });
    } catch (updateError) {
      next(updateError);
    }
  });

  router.delete('/achievements/:id', (request: Request, response: Response, next: NextFunction) => {
    try {
      const id = String(request.params.id);
      const deleted = stateManager.deleteAchievement(id);
      if (!deleted) {
        response.status(404).json({ success: false, error: 'Achievement not found.' });
        return;
      }
      response.json({ success: true, message: `Deleted ${id}` });
    } catch (deletionError) {
      next(deletionError);
    }
  });

  router.get('/state', (_request: Request, response: Response) => {
    const dailyState = stateManager.getDailyState();
    response.json({ success: true, data: dailyState });
  });

  router.post('/achievements/:id/unlock', (request: Request, response: Response, next: NextFunction) => {
    try {
      const id = String(request.params.id);
      const result = stateManager.unlockAchievement(id);
      response.json({ success: true, data: result });
    } catch (unlockError) {
      next(unlockError);
    }
  });

  router.post('/achievements/:id/revoke', (request: Request, response: Response, next: NextFunction) => {
    try {
      const id = String(request.params.id);
      const revoked = stateManager.revokeAchievement(id);
      response.json({ success: true, data: { revoked } });
    } catch (revokeError) {
      next(revokeError);
    }
  });

  router.post('/reset', (_request: Request, response: Response, next: NextFunction) => {
    try {
      stateManager.performMidnightReset();
      response.json({ success: true, message: 'Reset performed successfully.' });
    } catch (resetError) {
      next(resetError);
    }
  });

  router.get('/history', (_request: Request, response: Response) => {
    const history = stateManager.getHistory();
    response.json({ success: true, data: history });
  });

  router.put('/history/day/:date', (request: Request, response: Response, next: NextFunction) => {
    try {
      const date = String(request.params.date);
      const payload = request.body;
      if (!payload || !Array.isArray(payload.achievementIds)) {
        response.status(400).json({ success: false, error: 'Field "achievementIds" must be an array of strings.' });
        return;
      }
      const result = stateManager.setDayAchievements(date, payload.achievementIds);
      response.json({ success: true, data: result });
    } catch (dayUpdateError: any) {
      response.status(400).json({ success: false, error: dayUpdateError.message });
    }
  });

  router.get('/progress', (_request: Request, response: Response) => {
    const progress = stateManager.getProgress();
    response.json({ success: true, data: progress });
  });

  router.post('/history/forget', (_request: Request, response: Response, next: NextFunction) => {
    try {
      stateManager.forgetHistory();
      response.json({ success: true, message: 'History and streaks cleared.' });
    } catch (forgetError) {
      next(forgetError);
    }
  });

  router.get('/config', (_request: Request, response: Response) => {
    const config = stateManager.getConfig();
    response.json({ success: true, data: config });
  });

  router.get('/network', (_request: Request, response: Response) => {
    const ip = getLocalIpAddress();
    const config = stateManager.getConfig();
    response.json({
      success: true,
      data: {
        ip,
        port: config.port,
        url: `http://${ip}:${config.port}`,
      },
    });
  });

  router.put('/config', (request: Request, response: Response, next: NextFunction) => {
    try {
      const updated = stateManager.updateConfig(request.body);
      response.json({ success: true, data: updated });
    } catch (configError) {
      next(configError);
    }
  });

  router.post('/upload', uploader.single('image'), (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.file) {
        response.status(400).json({ success: false, error: 'No image file uploaded.' });
        return;
      }
      logger.info(`Uploaded achievement image: ${request.file.filename}`);
      response.json({
        success: true,
        data: {
          fileName: request.file.filename,
          url: `/images/${request.file.filename}`,
        },
      });
    } catch (uploadError) {
      next(uploadError);
    }
  });

  return router;
}
