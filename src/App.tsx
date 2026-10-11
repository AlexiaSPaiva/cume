import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { OverlayProvider } from './components/Overlays';
import { ErrorBoundary, Skeleton } from './components/States';
import { UpdateBanner } from './components/UpdateBanner';
import { SyncBanner } from './components/Sync';
import { recoveryLink } from './lib/cloud';
import { startAutoSync } from './lib/syncApp';
import { hasSession } from './lib/auth';
import { DataProvider } from './lib/data';
import { db } from './lib/db';
import { Academica } from './pages/Academica';
import { Agenda } from './pages/Agenda';
import { Cronograma } from './pages/Cronograma';
import { Trilha } from './pages/trilha/Trilha';
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
  // chegou pelo link "criar senha nova" do e-mail
  const [recovery, setRecovery] = useState(recoveryLink);
  const inApp = session && !!settings && !recovery;

  // nuvem: sincroniza enquanto a conta está aberta
  useEffect(() => (inApp ? startAutoSync() : undefined), [inApp]);

  if (settings === undefined) return <><UpdateBanner /><Skeleton shell={session} /></>;
  if (!inApp) return <><UpdateBanner /><Login settings={settings ?? undefined} recovery={recovery} onIn={() => { setRecovery(false); setSession(true); }} /></>;

  return (
    <BrowserRouter>
      <UpdateBanner />
      <SyncBanner onRelogin={() => setSession(false)} />
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
              <Route path="area/academica" element={<Academica />} />
              <Route path="area/academica/trilha/:id" element={<Trilha />} />
              <Route path="area/academica/cronograma" element={<Cronograma />} />
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
