import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { OverlayProvider } from './components/Overlays';
import { ErrorBoundary, Skeleton } from './components/States';
import { UpdateBanner } from './components/UpdateBanner';
import { hasSession } from './lib/auth';
import { DataProvider } from './lib/data';
import { db } from './lib/db';
import { Agenda } from './pages/Agenda';
import { AreaPanel } from './pages/AreaPanel';
import { Calendario } from './pages/Calendario';
import { Cofre } from './pages/Cofre';
import { Historico } from './pages/Historico';
import { Imprevistos } from './pages/Imprevistos';
import { Inicio } from './pages/Inicio';
import { Login } from './pages/Login';
import { Metas } from './pages/Metas';
import { MinhaSemana } from './pages/MinhaSemana';
import { Personalizar } from './pages/Personalizar';
import { Planejamento } from './pages/Planejamento';
import { Tarefas } from './pages/Tarefas';

export function App() {
  const [session, setSession] = useState(hasSession());
  // null = ainda carregando; undefined = sem configurações (primeiro acesso)
  const settings = useLiveQuery(async () => (await db.settings.get('me')) ?? null, []);

  if (settings === undefined) return <><Skeleton shell={session} /><UpdateBanner /></>;
  if (!session || !settings) return <><Login settings={settings ?? undefined} onIn={() => setSession(true)} /><UpdateBanner /></>;

  return (
    <BrowserRouter>
      <UpdateBanner />
      <ErrorBoundary>
      <DataProvider settings={settings} fallback={<Skeleton />}>
        <OverlayProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Inicio />} />
              <Route path="semana" element={<MinhaSemana />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="tarefas" element={<Tarefas />} />
              <Route path="planejamento" element={<Planejamento />} />
              <Route path="calendario" element={<Calendario />} />
              <Route path="metas" element={<Metas />} />
              <Route path="imprevistos" element={<Imprevistos />} />
              <Route path="historico" element={<Historico />} />
              <Route path="area/adultices/cofre" element={<Cofre />} />
              <Route path="area/:id" element={<AreaPanel />} />
              <Route path="personalizar" element={<Personalizar onLogout={() => setSession(false)} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </OverlayProvider>
      </DataProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
