import { TelemetryService } from '../telemetry.js';
import { TelemetryOptions } from '../types.js';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

// Mock fs-extra
jest.mock('fs-extra');

describe('TelemetryService', () => {
  let telemetry: TelemetryService;
  let mockFs: jest.Mocked<typeof fs>;

  const configPath = path.join(os.homedir(), '.flash-install', 'telemetry.json');
  const eventsPath = path.join(os.homedir(), '.flash-install', 'events.json');

  beforeEach(() => {
    // Reset all mocks
    mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.ensureDir.mockImplementation(() => Promise.resolve());
    mockFs.pathExists.mockImplementation(() => Promise.resolve(false));
    mockFs.writeJSON.mockImplementation(() => Promise.resolve());
    mockFs.readJSON.mockImplementation(() => Promise.resolve({}));

    // Create fresh telemetry service
    telemetry = new TelemetryService();
  });

  afterEach(async () => {
    // Clear events after each test
    await telemetry.clearEvents();
  });

  describe('initialization', () => {
    test('should be disabled by default', async () => {
      expect(telemetry.isEnabled()).toBe(false);
    });

    test('should generate anonymous installation ID', async () => {
      await telemetry.enable();
      const config = telemetry.getConfig();
      expect(config.installId).toBeDefined();
      expect(typeof config.installId).toBe('string');
      expect(config.installId!.length).toBe(16);
    });

    test('should create anonymous ID based on system info', async () => {
      await telemetry.enable();

      // Generate another service with same system info
      const telemetry2 = new TelemetryService();
      await telemetry2.enable();

      // They should have the same ID since system info is the same
      expect(telemetry.getConfig().installId).toBe(telemetry2.getConfig().installId);
    });
  });

  describe('enable/disable', () => {
    test('should enable telemetry collection', async () => {
      await telemetry.enable();
      expect(telemetry.isEnabled()).toBe(true);
      expect(mockFs.writeJSON).toHaveBeenCalledWith(configPath, expect.objectContaining({ enabled: true }));
    });

    test('should disable telemetry collection', async () => {
      await telemetry.enable();
      await telemetry.disable();

      expect(telemetry.isEnabled()).toBe(false);
      expect(mockFs.writeJSON).toHaveBeenCalledWith(configPath, expect.objectContaining({ enabled: false }));
    });
  });

  describe('command tracking', () => {
    test('should track command execution when enabled', async () => {
      await telemetry.enable();
      await telemetry.trackCommand('install', 1200, true);

      const stats = await telemetry.getStats();
      expect(stats).toBeTruthy();
      expect(stats!.totalCommands).toBe(1);
      expect(stats!.averageDuration).toBe(1200);
      expect(stats!.topCommands.install).toBe(1);
    });

    test('should not track commands when disabled', async () => {
      await telemetry.trackCommand('install', 1000, true);

      const stats = await telemetry.getStats();
      expect(stats).toBe(null);
    });

    test('should handle multiple command executions', async () => {
      await telemetry.enable();

      await telemetry.trackCommand('install', 500, true);
      await telemetry.trackCommand('install', 700, true);
      await telemetry.trackCommand('snapshot', 200, true);

      const stats = await telemetry.getStats();
      expect(stats).toBeTruthy();
      expect(stats!.totalCommands).toBe(3);
      expect(stats!.averageDuration).toBe(467); // Average of 500, 700, 200
      expect(stats!.topCommands.install).toBe(2);
      expect(stats!.topCommands.snapshot).toBe(1);
    });
  });

  describe('performance tracking', () => {
    test('should track performance metrics when enabled', async () => {
      await telemetry.enable();
      await telemetry.trackPerformance(0.8, 50, 'npm', true);

      const stats = await telemetry.getStats();
      expect(stats).toBeTruthy();
      expect(stats!.overallCacheHitRate).toBe(0.8);
      expect(stats!.packageManagerUsage.npm).toBe(1);
    });

    test('should not track performance when disabled', async () => {
      await telemetry.trackPerformance(1.0, 25, 'yarn', true);

      const stats = await telemetry.getStats();
      expect(stats).toBe(null);
    });

    test('should aggregate cache hit rates', async () => {
      await telemetry.enable();

      await telemetry.trackPerformance(0.9, 10, 'npm', true);
      await telemetry.trackPerformance(0.7, 10, 'npm', true);

      const stats = await telemetry.getStats();
      expect(stats!.overallCacheHitRate).toBe(0.8); // Average of 0.9 and 0.7
    });
  });

  describe('error tracking', () => {
    test('should track errors when enabled', async () => {
      await telemetry.enable();
      await telemetry.trackError('Cannot find package', 'install');

      const stats = await telemetry.getStats();
      expect(stats).toBeTruthy();
      expect(stats!.errorRate).toBe(1); // 1 out of 1 event is an error
    });

    test('should not track errors when disabled', async () => {
      await telemetry.trackError('Network error', 'install');

      const stats = await telemetry.getStats();
      expect(stats).toBe(null);
    });
  });

  describe('data persistence', () => {
    test('should save configuration to disk', async () => {
      await telemetry.enable();

      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        configPath,
        expect.objectContaining({
          enabled: true,
          anonymize: true,
          installId: expect.any(String)
        })
      );
    });

    test('should load existing configuration', () => {
      mockFs.pathExists.mockImplementation(() => Promise.resolve(true));
      mockFs.readJSON.mockImplementation(() => Promise.resolve({
        enabled: true,
        installId: 'test-id-12345678',
        anonymize: false
      }));

      const newTelemetry = new TelemetryService();
      expect(newTelemetry.isEnabled()).toBe(true);
      expect(newTelemetry.getConfig().installId).toBe('test-id-12345678');
    });
  });

  describe('privacy features', () => {
    test('should anonymize data by default', async () => {
      const config = telemetry.getConfig();
      expect(config.anonymize).toBe(true);
    });

    test('should generate consistent anonymous IDs', async () => {
      await telemetry.enable();
      const id1 = telemetry.getConfig().installId;

      // Reset and reinitialize
      const telemetry2 = new TelemetryService();
      await telemetry2.enable();
      const id2 = telemetry2.getConfig().installId;

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).toBe(id2); // Same system should generate same ID
    });

    test('should allow disabling anonymization', async () => {
      const customTelemetry = new TelemetryService({ anonymize: false });
      expect(customTelemetry.getConfig().anonymize).toBe(false);
    });
  });

  describe('statistics', () => {
    test('should calculate correct statistics', async () => {
      await telemetry.enable();

      await telemetry.trackCommand('install', 1000, true);
      await telemetry.trackCommand('snapshot', 500, false);
      await telemetry.trackPerformance(0.75, 20, 'npm', true);
      await telemetry.trackError('Package not found', 'install');

      const stats = await telemetry.getStats();
      expect(stats).toBeTruthy();
      expect(stats!.totalCommands).toBe(3);
      expect(stats!.averageDuration).toBe(750);
      expect(stats!.overallCacheHitRate).toBe(0.75);
      expect(stats!.errorRate).toBe(1/3);
    });

    test('should return null stats when no data', () => {
      const stats = telemetry.getStats();
      expect(stats).toBe(null);
    });
  });

  describe('clear events', () => {
    test('should clear stored events', async () => {
      await telemetry.enable();
      await telemetry.trackCommand('install', 1000, true);

      // Verify data exists
      const statsBefore = await telemetry.getStats();
      expect(statsBefore).toBeTruthy();

      // Clear events
      await telemetry.clearEvents();

      // Verify data is cleared
      const statsAfter = await telemetry.getStats();
      expect(statsAfter).toBe(null);
    });
  });
});