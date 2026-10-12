<p align="center"><img src="docs/brand/cume-brand/icon-rounded.svg" width="96" alt="" /></p>

# Cume° · Personal Life OS

**Foco · Clareza · Ação**

PWA (instalável e offline) feito a partir do `MeuPlano_Design_v6.pdf` e da v7 (`docs/v7/`).
Identidade visual em `docs/brand/` (guia `Cume_Guia_de_Identidade.pdf`).

<p align="center"><img src="docs/brand/cume-brand/preview-marca.png" width="720" alt="Ícone e logo do Cume°" /></p>

| Amanhecer · 05h–10h | Dia · 10h–16h | Entardecer · 16h–19h | Noite · 19h–05h |
| --- | --- | --- | --- |
| <img src="public/scenes/cume-bg-amanhecer-hero-mobile.jpg" width="180" alt="" /> | <img src="public/scenes/cume-bg-dia-hero-mobile.jpg" width="180" alt="" /> | <img src="public/scenes/cume-bg-entardecer-hero-mobile.jpg" width="180" alt="" /> | <img src="public/scenes/cume-bg-noite-hero-mobile.jpg" width="180" alt="" /> |

O cenário do topo e do login muda pelo horário (`src/lib/scene.ts`) ou fica fixo em Personalizar → Cenário.

> **Nomes históricos que não mudam:** o banco IndexedDB `meuplano`, as chaves `meuplano.*` do localStorage,
> o formato `meuplano-backup` e o endereço `meuplano-rouge.vercel.app`. Os dados ficam no navegador,
> e cada endereço tem um armazenamento separado: trocar o nome ou o endereço esconderia os dados.

## Rodar

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # gera dist/ com service worker
pnpm preview    # testa o build (instalação e offline)
```

## Publicação

No ar em https://meuplano-rouge.vercel.app (Vercel). Cada push na branch `main` do GitHub publica sozinho.

## Nuvem (Supabase)

Contas e cópia dos dados ficam no Supabase (projeto `cume`, São Paulo), para entrar em qualquer aparelho.

- Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave pública) em `.env.local` e na Vercel.
  Sem elas o app funciona só no aparelho, como antes (os testes rodam assim).
- Banco: `supabase/schema.sql` (uma tabela `rows` com tabela + chave + JSON; cada pessoa só vê as próprias
  linhas por RLS; arquivos no bucket privado `arquivos/<id da pessoa>/`).
- Sincronização (`src/lib/sync.ts`, `src/lib/syncApp.ts`): o aparelho continua sendo o principal e funciona offline.
  Sobe o que mudou (lista de pendentes no localStorage), desce o que mudou na nuvem; no mesmo registro vence o
  `updatedAt` mais recente. Ids novos são únicos entre aparelhos (`newId` em `db.ts`); ao ligar um aparelho com
  ids antigos que colidem com a nuvem, os daqui são renumerados com as ligações corrigidas.
- Login (`src/lib/auth.ts`): confere na nuvem e no aparelho. Conta de antes da nuvem: ao entrar, a mesma conta é
  criada na nuvem com a mesma senha e os dados sobem. Aparelho novo: entra e os dados descem.
  "Esqueci a senha" manda um link por e-mail.

## Telas

Entrada (Entrar em cima, Criar conta embaixo; várias contas por aparelho) · boas-vindas · Início · Minha semana ·
Agenda · Tarefas (Quadro · Lista · Adiadas · Lixeira) · Planejamento (com Estudos da semana) · Calendário ·
Objetivos e Metas · Imprevistos · Histórico e desempenho · painéis das 6 áreas · Financeiro (Visão geral · Renda extra ·
Contas e cartões · Reserva · Cofre de comprovantes) · Acadêmica por trilhas (concurso, curso, graduação, pesquisa,
extensão, idioma) · Cronograma de estudos · Cofre de documentos · Personalizar.

## Recursos (v7 + pedidos)

- **Modo foco** (⛶ em todo card e no topo), menu lateral recolhível, menu ⋯ com ordem fixa, estados de
  carregando/erro/vazio/offline.
- **Renda extra** como aba do Financeiro (`src/lib/freelance.ts`): dias ↔ horas só na exibição; pago entra no saldo.
- **Histórico e desempenho** (`src/lib/history.ts`, só lê): dia/semana/mês/ano × anterior/média/meta, métricas
  próprias, fechamento automático no dia 1º às 08:00.
- **Tarefas adiadas** (`src/lib/tasks.ts`): adiar com motivo, Realocar a MESMA tarefa (dia, Planejamento ou backlog),
  histórico de adiamentos, gesto de deslizar no celular.
- **Metas pelas tarefas** ou **por valor** (atual e alvo). Pelas tarefas: cada tarefa comum vale 1 e cada
  **tarefa semanal** (ex.: Estudar Matemática seg/qua/sex até 31/12) vale os dias em que acontece até a data
  final da repetição (`src/lib/recurring.ts`); cada dia é marcado em Minha semana ou no card da meta.
- **Trilhas ligadas a metas e objetivos**: uma meta pode contar TODAS as tarefas de uma trilha (inclusive as futuras) ou só as
  escolhidas (`trackId`/`trackAll` na meta); um objetivo pode ser medido pela trilha (`Objective.trackId`) com os índices de
  `trackIndicators`: tempo estudado ÷ plano, edital coberto, acertos (questões + simulados) ÷ meta e último simulado.
- **Vencimentos das contas** (`src/lib/bills.ts`): conta com dia de vencimento, valor e "todo mês"; vira ocorrências no
  Calendário geral, na aba Contas do Financeiro (com "pagar") e nos avisos de prazo.
- **Estudos** (`src/lib/study.ts`): trilhas com abas pelo tipo; concurso com necessidade por matéria
  (peso × distância da meta × edital que falta) e "Gerar cronograma pela necessidade"; pesquisa com artigos,
  fichamento salvo sozinho e diário; curso/graduação com módulos, provas e notas; sessões de estudo = tarefas
  da Agenda com `trackId` (nunca duplicadas); pomodoro, revisões 24h/7d/30d e alarmes (`src/lib/reminders.ts`).
- **Imprevistos recorrentes** (`src/lib/recurrence.ts`) e **link do Google Drive** no Cofre.
- **Contas**: cada conta tem o próprio banco no aparelho (`src/lib/auth.ts`) e uma cópia na nuvem; a conta antiga
  continua no banco histórico `meuplano`. Os avisos funcionam com o app aberto.

## Dados (regras que não podem ser quebradas)

- Tudo fica no IndexedDB (Dexie, `src/lib/db.ts`, hoje na versão 5). Arquivos: binário em `blobs`, metadados em
  `attachments` (`src/lib/attachments.ts`). URLs de arquivo são criadas na hora de exibir.
- **Schema versionado**: toda mudança de estrutura = nova `db.version(n)`; as versões 3, 4 e 5 só ACRESCENTARAM
  tabelas. Proibido apagar/recriar o banco. Os testes em `tests/unit/migration.test.ts` provam isso.
- **Exclusão** = soft delete (`deletedAt`) + "Desfazer" (6 s) + Lixeira de 30 dias (`src/lib/trash.ts`).
- **Formulários**: rascunho (novo) ou autosave (edição) com debounce, "salvo às HH:MM" (`src/lib/drafts.ts`).
- **Versão nova do app**: entra sozinha ao abrir o app ou quando a pessoa sai dele (`UpdateBanner.tsx`);
  os dados e rascunhos ficam.
- **Backup** `.zip` (JSON + arquivos) em Personalizar; importar soma, nunca apaga (`src/lib/backup.ts`).
- **Dados de exemplo**: o app começa vazio; exemplos só com `/?exemplos=1` (demonstração e testes). A limpeza
  automática (`src/lib/cleanup.ts`) tira os exemplos das contas antigas, mas nunca o que a pessoa criou, editou
  ou usa; guarda uma cópia do que saiu.

## Testes

```sh
pnpm test        # Vitest + fake-indexeddb: migração, lixeira, backup, limpeza, renda extra, histórico, tarefas, estudos
pnpm test:e2e    # Playwright: Chrome (fluxos, layout 360–1280, 44px) e iPhone/WebKit (320, 375, 390, 430 px)
```
