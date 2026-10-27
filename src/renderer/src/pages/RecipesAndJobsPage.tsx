import { FileText, BriefcaseBusiness } from 'lucide-react';
import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { KeyboardEvent } from 'react';
import type { RecipesAndJobsTab } from '../app/routes';
import { PageHeader } from '../components/common/PageHeader';
import { PrescriptionsPage } from './PrescriptionsPage';
import { WorkPage } from './WorkPage';

const tabs = [
  { id: 'recetas', label: 'Recetas', icon: FileText },
  { id: 'trabajos', label: 'Trabajos', icon: BriefcaseBusiness },
] as const;

function tabFromSearchParams(searchParams: URLSearchParams): RecipesAndJobsTab {
  return searchParams.get('tab') === 'trabajos' ? 'trabajos' : 'recetas';
}

export function RecipesAndJobsPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabFromSearchParams(searchParams);
  const tabRefs = useRef<Partial<Record<RecipesAndJobsTab, HTMLButtonElement>>>({});

  const selectTab = (tab: RecipesAndJobsTab): void => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('tab', tab);
    setSearchParams(nextSearchParams);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: RecipesAndJobsTab,
  ): void => {
    const currentIndex = tabs.findIndex((tab) => tab.id === currentTab);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex]?.id;
    if (!nextTab) return;
    selectTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Historial óptico y gestión comercial"
        title="Recetas y trabajos"
        description="Consultá recetas y fichas ópticas desde una única sección, sin mezclar sus búsquedas ni historiales."
      />

      <div
        className="flex w-full max-w-2xl gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
        role="tablist"
        aria-label="Recetas y trabajos"
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[tab.id] = element ?? undefined;
              }}
              id={`recetas-trabajos-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`recetas-trabajos-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={`flex min-h-12 min-w-40 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-base font-bold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                selected
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-teal-50 hover:text-teal-900'
              }`}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              <tab.icon size={21} strokeWidth={1.9} aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <section
        id="recetas-trabajos-panel-recetas"
        role="tabpanel"
        aria-labelledby="recetas-trabajos-tab-recetas"
        tabIndex={0}
        hidden={activeTab !== 'recetas'}
      >
        <PrescriptionsPage embedded />
      </section>
      <section
        id="recetas-trabajos-panel-trabajos"
        role="tabpanel"
        aria-labelledby="recetas-trabajos-tab-trabajos"
        tabIndex={0}
        hidden={activeTab !== 'trabajos'}
      >
        <WorkPage embedded />
      </section>
    </div>
  );
}
