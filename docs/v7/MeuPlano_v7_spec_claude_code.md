# MeuPlano · v7 — especificação para implementação

Referência visual: `MeuPlano_Design_v7.pdf` (13 páginas). Manter o design atual da v6 (cores, tipografia serifada nos títulos, cards escuros, acento dourado `#c8a97e`, rodapé "Você vê / Você mexe / Conecta com"). Tudo marcado como NOVO no PDF é escopo desta versão.

## Princípios (valem para o app inteiro)
1. **Um dado, um lugar.** Cada informação é criada uma vez e referenciada onde aparece. Um bloco de estudo é um evento da Agenda com `trackId`; nunca duplicar.
2. **Nada some sem aviso.** Adiar/mover/excluir deixam histórico. Excluir = soft delete (`deletedAt`) + toast "Desfazer" (6 s) + Lixeira por 30 dias.
3. **Mesmas peças em toda tela.** AppShell, KPIs, cards, rodapé padrão. Um botão primário (dourado) por tela. Menu de item (⋯) sempre na mesma ordem: Abrir · Editar · Mover/Realocar · Adiar · Duplicar · Excluir.
4. Todo registro tem `createdAt` e `updatedAt`. Estados: vazio com convite, carregando (skeleton), erro com "Tentar de novo", offline com selo "salvo no aparelho".

## 1. Responsivo + modo foco (p. 2, p. 9)
- Breakpoints: `<768` celular, `768–1199` tablet, `≥1200` desktop.
- Desktop: sidebar fixa, recolhível com «; preferência salva no perfil.
- Tablet: sidebar vira trilho de ícones; grids em 2 colunas; KPIs em 3 + scroll horizontal interno.
- Celular: bottom nav (Início, Semana, + ação rápida, Tarefas, Mais); cards empilhados; tabelas → listas de cartões; drawers → bottom sheet; swipe em itens de lista revela Realocar / Excluir.
- **FocusMode**: ícone ⛶ no topbar e em todo `Card expandable`. Abre o conteúdo em portal tela cheia, sem sidebar/hero. Sai com ✕, Esc (ou arrastar para baixo no celular). Prende o foco do teclado, preserva estado e restaura o scroll ao fechar.
- PWA: manifest `display: standalone`; service worker com cache dos dados do último acesso e sincronização ao reconectar.

## 2. Renda extra (p. 3) — aba dentro de Financeiro
- **Não é área nova.** Financeiro ganha abas: Visão geral · **Renda extra** · Contas e cartões · Reserva · Cofre de comprovantes. A sidebar continua com 6 áreas.
- O tempo da renda extra conta no foco e no tempo do Financeiro (`areaId=financeiro`, `subcategory=renda_extra`); em Início e Histórico aparece somado ao Financeiro, com detalhe da subcategoria ao abrir.
- KPIs: faturado no mês, trabalhado no mês (na unidade escolhida), valor médio (por dia e por hora), a receber, próximo prazo.
- **Tempo e foco** com toggle `Dias | Horas`. A conversão usa `hoursPerDay` (padrão 7, ajustável nas configurações). O toggle só muda a exibição, nunca os valores salvos.
- Form **Registrar trabalho**: cliente, projeto, unidade (dias de freela / horas), quantidade (mostra equivalência), datas, cobrança (por dia / por hora / fechado), valor, status (pago / a receber + vencimento / em negociação), opções: bloquear tempo na Agenda, entrar no saldo quando pago (com opção de mandar para a Reserva), anexar nota fiscal ao Cofre.
- Listas: Projetos e clientes (com progresso), A receber, Faturamento por mês (pago vs a receber, linha da meta).

## 3. Histórico e desempenho (p. 4) — novo item em SISTEMA
- Rota `/historico?periodo=dia|semana|mes|ano&comparar=anterior|media|meta`.
- Controles: período, navegação ‹ ›, comparar com (anterior / média 3 períodos / meta), filtro de área, Exportar PDF.
- KPIs com delta: horas produtivas, tarefas concluídas (+ % no prazo), adiamentos (menos é melhor), imprevistos, metas que avançaram.
- Cards: Tempo por área (período vs comparação), Mapa do mês (heatmap de horas por dia; clique abre o dia), Métricas (tabela: métrica, origem sistema/você, atual, anterior, Δ, sparkline 6 períodos, abrir), Resumo do período (melhor semana, dia mais difícil, padrão detectado, evolução no ano).
- Métricas do usuário: o usuário cria métricas próprias (nome, unidade, área, agregação) e lança valores; entram no mesmo formato das métricas do sistema.
- Fechamento automático no dia 1º às 08:00 → notificação no sino + snapshot salvo.
- Somente leitura: agrega dados de Tarefas, Agenda, Imprevistos, Metas e MetricEntry.

## 4. Tarefas adiadas (p. 5)
- Em Tarefas, abas: Quadro · Lista · **Adiadas** · **Lixeira**.
- Tabela de adiadas: tarefa, área, era para, nº de adiamentos, motivo (link para o imprevisto quando houver), ações [Realocar] [⋯]. Filtros: área, motivo, período.
- Histórico 30 dias: realocadas (de → para, resultado), excluídas (restaurar até X dias).
- **RescheduleDrawer** (reutilizado também no Planejamento e no celular como bottom sheet): destino `Um dia e horário | Planejamento (semana que vem) | Backlog`; mini-semana com horas livres por dia; sugestão de horário (baseada em quando a pessoa conclui tarefas daquela área); opções avisar X min antes e quebrar em sessões; botão primário "Realocar para …"; link "Excluir tarefa" (vai para Lixeira).
- Regras: realocar mantém o mesmo `id`, vínculos com metas e o histórico; incrementa `postponeLog`. Nunca cria cópia. Imprevisto com "Adiou tarefas" muda as tarefas ligadas para `postponed` com o motivo. O backlog do Planejamento mostra adiadas com selo "adiada Nx".

## 4b. Planejamento (p. 6)
- Mantém o layout da v6 (horas por área, Top 3, backlog, fechamento). A linha Financeiro mostra a renda extra incluída.
- KPI novo "Estudo planejado" (horas e nº de trilhas, vindo do Cronograma de estudos).
- Linha Acadêmica com selo "via Cronograma de estudos": as horas de estudo são definidas lá.
- **Card novo "Estudos da semana"**: total de horas e blocos, barra por tipo de trilha, 2–3 destaques (simulado, entregas) e o botão **Abrir planejamento de estudos ›**, que abre `/area/academica/cronograma` em modo foco; ✕/Esc volta para o Planejamento.
- O backlog mostra as tarefas adiadas com selo "adiada Nx".

## 5. Acadêmica por trilhas (p. 7)
- `/area/academica`: KPIs (trilhas ativas, estudo na semana vs planejado, revisões hoje, próximo prazo, próxima prova), filtro por tipo, botão primário **+ Nova trilha**.
- Tipos de trilha: `degree` (graduação), `course` (curso de qualificação: Python, Dados…), `extension`, `research`, `exam` (concurso), `language`.
- Card de trilha: tipo, título, métrica principal, progresso, horas/semana, próximo prazo, [Abrir] [▶ Estudar agora].
- Lateral: "Hoje no estudo" (sessões do dia com alarmes) + botão "Abrir planejamento de estudos ›" (mesmo destino do botão do Planejamento).
- Modelo comum: Trilha → Plano (matérias/módulos/etapas) → Metas → Cronograma → Sessões → Desempenho. O tipo define as abas:
  - concurso: Visão geral, Matérias, Cronograma, Edital e prazos, Documentos, Simulados
  - pesquisa: Visão geral, Artigos, Arquivos, Diário
  - curso: Módulos, Cronograma, Certificado
  - graduação: Disciplinas, Provas, Notas

## 6. Concurso (p. 8–9)
**Visão geral**: KPIs (dias até a prova, % do edital coberto, acertos médios vs meta, horas estudadas vs planejadas, matéria de maior necessidade).
- Tabela macro por matéria: questões e peso, tópicos estudados/total, % de acertos, necessidade (alta/média/baixa), horas.
- Necessidade = `peso × max(0, metaAcerto − acerto) × (1 − %tópicosEstudados)`; ordena o ranking.
- Botões: **Gerar cronograma pela necessidade** (distribui horas livres pelo ranking; blocos podem ser travados/movidos), + Lançar questões, + Simulado.
- Visão micro da matéria: tópicos com status (`todo|studying|studied|reviewed`) e % por tópico, próxima revisão, gráfico de acertos das últimas sessões vs meta.

**Edital e prazos / Documentos**:
- Stepper da inscrição: edital lido → inscrição feita → boleto pago → cartão de confirmação → prova → resultado.
- Lista de datas do edital (editável, + data), passadas riscadas; mini calendário mostrando só as datas deste concurso; toggle "Mostrar no Calendário e Agenda gerais".
- Documentos: edital (PDF), boleto de inscrição (valor, vencimento, status pago), comprovante de pagamento, link para pasta do Google Drive; área de upload que aceita arquivo **ou** link, com tipo (Edital, Boleto, Comprovante, Material, Link de pasta).
- Alertas do edital com toggles (ex.: cartão de confirmação, prova 7d/1d/3h antes, prazo de recursos).
- Boleto → vencimento no Financeiro e no Calendário; comprovante liga ao Financeiro.

## 7. Cronograma de estudos (p. 10)
- `/area/academica/cronograma`, abre em modo foco. Visões Dia/Semana/Mês; filtro por tipo de trilha.
- Grade semanal (`WeekGrid`, mesmo componente da Agenda) só com blocos de estudo coloridos por trilha; compromissos de outras áreas aparecem cinza tracejados, somente leitura (editar só na Agenda).
- Toggle "Mostrar na Agenda e no Calendário gerais" (padrão ligado). Mover um bloco aqui move o mesmo evento na Agenda.
- Botões: Gerar pela necessidade, + Bloco de estudo (primário).
- Resumo da semana: horas planejadas por tipo de trilha + horas livres restantes.
- **Alarmes e alertas**: início do bloco (X min antes), revisão espaçada automática (24h, 7d, 30d), pomodoro configurável (ex.: 50/10), resumo da noite, prazos do edital, horário silencioso (ex.: seg–sex 09–16 só urgentes). Canais: notificação push e e-mail.
- Sessão ativa: timer pomodoro com Pausar / Concluir; concluir registra horas e, se houver, questões.

## 8. Pesquisa científica (p. 11)
- KPIs: etapa atual (n de 5), artigos triados/total e fichados, data do último registro (e "há X dias"), próxima entrega, horas na semana vs meta.
- **Artigos**: lista com PDF anexado, autor/ano, status (`a triar|lendo|incluído|excluído|fichado`), filtro; + anexar PDF.
- **Nota de desenvolvimento** por artigo (fichamento): objetivo, método, achados, como uso na pesquisa, marcadores, páginas destacadas; salvamento automático com horário; botão Abrir PDF.
- **Arquivos e links**: planilhas, notebooks, Zotero, pasta do Drive.
- **Diário de acompanhamento**: campo "O que você avançou hoje?", opcional ligar a um artigo e lançar horas; [Registrar]. Linha do tempo com data e horas de cada registro, mais recente no topo. A data do último registro alimenta o KPI e um alerta se passar de N dias sem registro.

## 9. Entidades (novas e alteradas)
```
Area            sem mudança (6 áreas); TimeEntry/AgendaEvent ganham subcategory? (ex.: renda_extra em financeiro)
Client          id, name, contact?
FreelanceProject id, clientId, title, status, progress, dueDate?
FreelanceEntry  id, clientId, projectId, dateStart, dateEnd, unit: days|hours, quantity,
                hoursPerDay (default 7), billing: day|hour|fixed, amount,
                status: paid|receivable|negotiating, dueDate?, financeTxId?, agendaEventId?
Task            + status postponed, postponeCount, postponeLog[{from,to,reasonId?,reasonText,at}], deletedAt?
Metric          id, name, source: system|user, unit, areaId, aggregation: sum|avg|last
MetricEntry     id, metricId, date, value
HistorySnapshot id, period: day|week|month|year, start, data(json), createdAt
Track           id, type: degree|course|extension|research|exam|language, title, color, goalIds[], status
Subject         id, trackId, name, weight, questionsCount, targetAccuracy
Topic           id, subjectId, name, status: todo|studying|studied|reviewed, nextReviewAt?
QuestionLog     id, subjectId, topicId?, date, total, correct
MockExam        id, trackId, date, total, correct, bySubject[]
StudySession    = AgendaEvent com trackId, subjectId?, topicId? (não duplicar evento)
ExamNotice      id, trackId, dates[{label, date, alertOffsets[]}], showInCalendar
Attachment      id, ownerType, ownerId, kind: notice|boleto|receipt|material|article|file|link,
                url | blobRef, name, size?, meta(json: valor, vencimento, pago...)
ArticleNote     id, attachmentId, objective, method, findings, usage, tags[], pages[]
JournalEntry    id, trackId, text, hours?, articleId?, createdAt
Alarm           id, targetType, targetId, rule: before_block|spaced_review|pomodoro|deadline|nightly,
                offsets[], channels[push,email], quietHours?
```

## 10. Componentes compartilhados
AppShell (sidebar recolhível, topbar com ⛶, rodapé padrão) · KpiCard · Card (`expandable`) · FocusMode · ItemMenu (⋯) · UndoToast · Segmented · UnitToggle (dias/horas) · RescheduleDrawer · AttachmentDrop (arquivo ou link) · WeekGrid · Stepper · Heatmap · Sparkline · EmptyState.

## 11. Rotas
```
/area/financeiro?aba=renda-extra
/planejamento   (+ card Estudos da semana → /area/academica/cronograma)
/historico?periodo=&comparar=
/tarefas?aba=adiadas | /tarefas?aba=lixeira
/area/academica
/area/academica/trilha/:id?aba=
/area/academica/cronograma
```

## 12. Critérios de aceite
- [ ] Nenhuma rolagem horizontal em 360 px; todas as telas usáveis com bottom nav.
- [ ] Todo card expansível abre em tela cheia e fecha com ✕/Esc sem perder estado.
- [ ] Sidebar recolhida continua recolhida após recarregar.
- [ ] Bloco movido no Cronograma aparece movido na Agenda e no Calendário (mesmo id).
- [ ] Trocar dias/horas em Renda extra não altera valores salvos.
- [ ] Renda extra fica dentro de Financeiro (aba), não na sidebar; quando paga, entra no saldo do Financeiro.
- [ ] Botão "Abrir planejamento de estudos" no Planejamento e na Acadêmica abre o Cronograma em modo foco e o ✕ volta para a tela de origem.
- [ ] Tarefa realocada mantém id, metas vinculadas e incrementa o contador.
- [ ] Toda exclusão mostra Desfazer e vai para a Lixeira por 30 dias.
- [ ] Histórico compara dia/semana/mês/ano com anterior, média e meta, incluindo métricas do usuário.
- [ ] Concurso: anexar edital, boleto e comprovante como arquivo ou link; datas do edital aparecem no Calendário geral só se o toggle estiver ligado.
- [ ] Pesquisa: cada registro do diário mostra data; KPI "último registro" atualiza na hora.
