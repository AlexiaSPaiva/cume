import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';
import { App } from './App';
import { db } from './lib/db';
import { requestPersistence } from './lib/storage';
import { purgeExpired } from './lib/trash';

// pede armazenamento persistente e esvazia só o que está na Lixeira há mais de 30 dias
void requestPersistence();
void db.open().then(() => purgeExpired(db)).catch((e) => console.error('[meuplano] abrir banco', e));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
