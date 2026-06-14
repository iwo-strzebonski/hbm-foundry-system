/**
 * World data migration runner. Compares stored `flags.hbm.lastMigratedVersion`
 * against the system version and applies any pending migrations in order.
 *
 * Each migration module exports `run(): Promise<void>` and a numeric `targetVersion`
 * (semver-style string). Migrations are idempotent.
 */

import { SYSTEM_ID } from '../hbm';
import { migration_0_2_0 } from './0.2.0';
import { migration_1_2_0 } from './1.2.0';

export interface MigrationStep {
  version: string;       // version this migration brings the world TO
  description: string;
  run: () => Promise<void>;
}

const MIGRATIONS: MigrationStep[] = [
  migration_0_2_0,
  migration_1_2_0,
];

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export async function runPendingMigrations(): Promise<void> {
  if (!game.user?.isGM) return;
  const sys = game.system as unknown as { version: string };
  const currentVersion = sys.version ?? '0.0.0';
  const last = (game.settings.get(SYSTEM_ID, 'lastMigratedVersion') as string | undefined) ?? '0.0.0';

  if (compareSemver(last, currentVersion) >= 0) {
    return;
  }

  console.log(`${SYSTEM_ID} | Running migrations: ${last} → ${currentVersion}`);
  for (const step of MIGRATIONS) {
    if (compareSemver(last, step.version) < 0 && compareSemver(step.version, currentVersion) <= 0) {
      console.log(`${SYSTEM_ID} | Migration ${step.version}: ${step.description}`);
      try {
        await step.run();
      } catch (err) {
        console.error(`${SYSTEM_ID} | Migration ${step.version} failed`, err);
        ui.notifications?.error(`HbM migration ${step.version} failed - see console.`);
        return;
      }
    }
  }

  await game.settings.set(SYSTEM_ID, 'lastMigratedVersion', currentVersion);
  ui.notifications?.info(`HbM RPG v3 migrated to ${currentVersion}.`);
}

export function registerMigrationSettings(): void {
  game.settings.register(SYSTEM_ID, 'lastMigratedVersion', {
    name: 'Last migrated system version',
    scope: 'world',
    config: false,
    type: String,
    default: '0.0.0',
  });
}
