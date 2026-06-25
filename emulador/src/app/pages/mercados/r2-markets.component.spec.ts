import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R2MarketsComponent } from './r2-markets.component';
import { ManifestService } from '../../services/market-data/manifest.service';
import { DataOnboardingService } from '../../services/market-data/data-onboarding.service';
import { StorageManagerService } from '../storage-manager/storage-manager.service';
import { DialogService } from '../../components/ui/dialog.service';

describe('R2MarketsComponent — refresh on download completion', () => {
  const busy = signal<string | null>(null);

  function setup() {
    const manifest = { fetchManifest: vi.fn(() => Promise.resolve({ version: 1, symbols: {} })) };
    const storage = {
      listDatasets: vi.fn(() => Promise.resolve([])),
      totalBytes: vi.fn(() => 0),
    };
    const onboarding = {
      busySymbol: busy.asReadonly(),
      progress: signal(null).asReadonly(),
      runJobs: vi.fn(() => Promise.resolve()),
    };
    TestBed.configureTestingModule({
      providers: [
        R2MarketsComponent,
        { provide: ManifestService, useValue: manifest },
        { provide: StorageManagerService, useValue: storage },
        { provide: DataOnboardingService, useValue: onboarding },
        { provide: DialogService, useValue: {} },
      ],
    });
    const cmp = TestBed.inject(R2MarketsComponent);
    return { cmp, storage };
  }

  beforeEach(() => busy.set(null));

  it('reloads datasets when busySymbol returns to null', async () => {
    const { storage } = setup();
    TestBed.tick(); // run the initial effect + constructor load()
    await Promise.resolve();
    const callsAfterMount = storage.listDatasets.mock.calls.length;

    busy.set('US30'); // a download starts
    TestBed.tick();
    busy.set(null); // …and finishes
    TestBed.tick();
    await Promise.resolve();

    expect(storage.listDatasets.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
