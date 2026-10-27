import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/navigation/Sidebar';
import { GlobalSearch } from '../components/search/GlobalSearch';
import { BackupAlertBanner } from '../components/backup/BackupAlertBanner';

export function AppLayout(): React.JSX.Element {
  return (
    <div className="flex h-screen min-h-0 min-w-0 overflow-hidden bg-slate-100 text-slate-950">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex min-h-16 shrink-0 items-center border-b border-slate-200 bg-slate-100/95 px-4 sm:px-6 lg:px-8">
          <GlobalSearch />
        </header>
        <BackupAlertBanner />
        <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
