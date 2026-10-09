import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/navigation/Sidebar';
import { GlobalSearch } from '../components/search/GlobalSearch';

export function AppLayout(): React.JSX.Element {
  return (
    <div className="flex h-screen min-h-0 min-w-[820px] overflow-hidden bg-slate-100 text-slate-950">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex min-h-16 shrink-0 items-center border-b border-slate-200 bg-slate-100/95 px-6 lg:px-8">
          <GlobalSearch />
        </header>
        <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8 lg:py-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
