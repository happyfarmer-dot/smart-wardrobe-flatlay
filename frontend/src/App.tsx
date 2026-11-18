import React, { useEffect, useState } from 'react';
import { Navigation, StudioTab } from './components/Navigation';
import { WardrobeVault } from './components/WardrobeVault';
import { FlatLayStudio } from './components/FlatLayStudio';
import { HybridStylist } from './components/HybridStylist';
import { OotdCalendar } from './components/OotdCalendar';
import { TravelCapsule } from './components/TravelCapsule';
import { ArchitectureDocs } from './components/ArchitectureDocs';
import {
  DEFAULT_BODY_PROFILE,
  INITIAL_OOTD_LOGS,
  INITIAL_WARDROBE,
} from './data/demoWardrobe';
import { BodyProfile, OOTDLog, WardrobeItem } from './types/wardrobe';
import { computeOutfitSignature } from './engine/rulesEngine';

const STORAGE_KEY = 'atelier_2d_wardrobe_state_v1';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StudioTab>('wardrobe');

  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.wardrobe) && parsed.wardrobe.length > 0) {
          return parsed.wardrobe;
        }
      }
    } catch {
      // Fallback to initial curated wardrobe
    }
    return INITIAL_WARDROBE;
  });

  const [bodyProfile, setBodyProfile] = useState<BodyProfile>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.bodyProfile) return parsed.bodyProfile;
      }
    } catch {
      // ignore
    }
    return DEFAULT_BODY_PROFILE;
  });

  const [ootdLogs, setOotdLogs] = useState<OOTDLog[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.ootdLogs)) return parsed.ootdLogs;
      }
    } catch {
      // ignore
    }
    return INITIAL_OOTD_LOGS;
  });

  const [activeOutfitIds, setActiveOutfitIds] = useState<string[]>([
    'item-oxford-white',
    'item-trench-camel',
    'item-jeans-indigo',
    'item-loafers-espresso',
  ]);
  const [anchorItemId, setAnchorItemId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ wardrobe, bodyProfile, ootdLogs })
      );
    } catch {
      // Ignore quota exceeded for large custom uploads
    }
  }, [wardrobe, bodyProfile, ootdLogs]);

  const handleAddItems = (newItems: WardrobeItem[]) => {
    setWardrobe((prev) => [...newItems, ...prev]);
  };

  const handleLockAnchorItem = (itemId: string) => {
    setAnchorItemId(itemId);
    setActiveTab('stylist');
  };

  const handleLoadOutfitToCanvas = (itemIds: string[]) => {
    setActiveOutfitIds(itemIds);
    setActiveTab('canvas');
  };

  const handleSaveOotd = (
    itemIds: string[],
    dateStr: string,
    tuckedIn: boolean,
    notes?: string
  ) => {
    const newLog: OOTDLog = {
      id: `ootd-${Date.now()}`,
      wornDate: dateStr,
      itemIds,
      signatureHash: computeOutfitSignature(itemIds),
      occasion: 'daily',
      weatherTempC: 19,
      tuckedIn,
      notes,
    };

    setOotdLogs((prev) => {
      const filtered = prev.filter((l) => l.wornDate !== dateStr);
      return [newLog, ...filtered];
    });

    // Atomically mirror PostgreSQL trigger fn_sync_wear_on_ootd_insert()
    setWardrobe((prev) =>
      prev.map((item) => {
        if (!itemIds.includes(item.id)) return item;
        const nextLastWorn =
          !item.lastWornAt || dateStr > item.lastWornAt ? dateStr : item.lastWornAt;
        return {
          ...item,
          wearCount: item.wearCount + 1,
          lastWornAt: nextLastWorn,
        };
      })
    );
  };

  return (
    <div className="app-shell">
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        itemCount={wardrobe.length}
      />

      <main className="workspace-main">
        {activeTab === 'wardrobe' && (
          <WardrobeVault
            items={wardrobe}
            onAddItems={handleAddItems}
            onLockAnchorItem={handleLockAnchorItem}
          />
        )}

        {activeTab === 'canvas' && (
          <FlatLayStudio
            items={wardrobe}
            bodyProfile={bodyProfile}
            onUpdateBodyProfile={setBodyProfile}
            activeOutfitIds={activeOutfitIds}
            onChangeOutfitIds={setActiveOutfitIds}
            ootdLogs={ootdLogs}
            onSaveOotd={handleSaveOotd}
          />
        )}

        {activeTab === 'stylist' && (
          <HybridStylist
            items={wardrobe}
            anchorItemId={anchorItemId}
            onChangeAnchorItem={setAnchorItemId}
            onLoadOutfitToCanvas={handleLoadOutfitToCanvas}
          />
        )}

        {activeTab === 'calendar' && (
          <OotdCalendar
            items={wardrobe}
            ootdLogs={ootdLogs}
            activeOutfitIds={activeOutfitIds}
            onSaveOotd={handleSaveOotd}
            onLoadOutfitToCanvas={handleLoadOutfitToCanvas}
            onLockAnchorItem={handleLockAnchorItem}
          />
        )}

        {activeTab === 'capsule' && (
          <TravelCapsule
            items={wardrobe}
            onLoadOutfitToCanvas={handleLoadOutfitToCanvas}
          />
        )}

        {activeTab === 'docs' && <ArchitectureDocs />}
      </main>
    </div>
  );
};

export default App;
