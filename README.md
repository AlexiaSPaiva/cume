# MeuPlano · Personal Life OS

PWA (instalável e offline) feito a partir do `MeuPlano_Design_v6.pdf`.

## Rodar

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # gera dist/ com service worker
pnpm preview    # testa o build (instalação e offline)
```

## Telas

Login com cenários · Início · Minha semana · Agenda · Tarefas · Planejamento · Calendário ·
Objetivos e Metas · Imprevistos · painéis das 6 áreas · Cofre de documentos · Personalizar.

## Recursos novos (além do design)

- **Imprevistos recorrentes** (`src/lib/recurrence.ts`): imprevistos parecidos da mesma área são
  agrupados; quando um grupo aparece N vezes em 30 dias (padrão 3, ajustável), o app sugere
  reservar um bloco fixo no planejamento (dia da semana mais comum, horário típico, duração média).
  A sugestão aparece na Início, em Imprevistos, no Planejamento e no sino; aceitar cria um bloco
  semanal listrado na Agenda; "Agora não" silencia por 30 dias.
- **Link do Google Drive no Cofre**: além de enviar arquivo, dá para guardar o link de um documento
  do Drive (validado para `drive.google.com` / `docs.google.com`).

## Dados

Tudo fica no aparelho (IndexedDB via Dexie). A conta é local: a senha protege o acesso neste
aparelho, não há servidor. Backup/restauração em Personalizar. Para o Google Calendar, informe um
OAuth Client ID (Aplicativo da Web) em Calendário.
