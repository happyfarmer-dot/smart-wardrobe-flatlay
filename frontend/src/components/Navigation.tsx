import React from 'react';
import {
  Shirt,
  Layers,
  Sparkles,
  CalendarDays,
  Luggage,
  BookOpen,
  Cpu,
} from 'lucide-react';

export type StudioTab =
  | 'wardrobe'
  | 'canvas'
  | 'stylist'
  | 'calendar'
  | 'capsule'
  | 'docs';

interface NavigationProps {
  activeTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
  itemCount: number;
}

const TABS: { id: StudioTab; label: string; icon: React.ReactNode }[] = [
  { id: 'wardrobe', label: '數位衣櫃', icon: <Shirt size={16} /> },
  { id: 'canvas', label: '2D 身形拼貼', icon: <Layers size={16} /> },
  { id: 'stylist', label: '混合穿搭推薦', icon: <Sparkles size={16} /> },
  { id: 'calendar', label: 'OOTD 與 CPW', icon: <CalendarDays size={16} /> },
  { id: 'capsule', label: '旅行膠囊規劃', icon: <Luggage size={16} /> },
  { id: 'docs', label: '架構與技術文件', icon: <BookOpen size={16} /> },
];

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  itemCount,
}) => {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-mark">
          <h1 className="brand-title">ATELIER 2D</h1>
          <span className="brand-subtitle">Flat-Lay Smart Wardrobe</span>
        </div>

        <nav className="nav-tabs" aria-label="主要功能工作室">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              id={`nav-tab-${t.id}`}
              className={`nav-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => onSelectTab(t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-meta">
          <span className="zero-token-chip" title="所有視覺去背、K-Means 與規則過濾均於瀏覽器本地運行">
            <Cpu size={13} />
            <span>端側 0-Token · {itemCount} 件</span>
          </span>
        </div>
      </div>
    </header>
  );
};
