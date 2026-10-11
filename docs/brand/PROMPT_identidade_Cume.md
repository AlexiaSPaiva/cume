# Prompt para o Claude Code: identidade visual Cume°

> **Quando usar:** depois que a etapa 3 (modo foco, menu recolhível, menu ⋯ e telas de estado) estiver salva e publicada, e antes de começar a etapa 4.
> **Como usar:** descompacte `Cume_identidade.zip` na raiz do projeto. Ele cria a pasta `docs/brand/`. Depois cole o texto abaixo no Claude Code.
> Este prompt substitui a "Etapa 0" do prompt anterior da v7.

---

Aplique a identidade visual do guia `docs/brand/Cume_Guia_de_Identidade.pdf` e troque o nome do app para **Cume°**. Faça isso como **um passo separado**, com commit próprio, antes da etapa 4.

O app já está publicado em `meuplano-rouge.vercel.app` e tem dados reais. **Nada do que a usuária cadastrou pode sumir.**

## Material em `docs/brand/`
- `Cume_Guia_de_Identidade.pdf`: guia de 10 páginas com nome, logo, ícone, cores, fontes e cenários. Leia o guia inteiro antes de começar.
- `cume-brand/`: ícones (192, 512, maskable, iPhone), favicon (`.ico`, `.svg`, 32 e 16), `degree-target.svg` (o "°" em forma de alvo), `icon.svg` e `icon-1024.png`.
- `cume-cenarios/`: cenários de montanha em 4 horários (`amanhecer`, `dia`, `entardecer`, `noite`) e 4 formatos (`hero`, `hero-mobile`, `login`, `login-mobile`). Cada um vem em `.webp` e `.jpg`.

## 1. Nome
- **Logo:** "Cume" em Source Serif 4 **Italic** 400, cor `--color-text`. O "°" é desenhado com o `degree-target.svg` inline, no alto, como um expoente: cerca de 0,42em de tamanho e um pequeno recuo à esquerda.
- **Texto simples** (aba, manifest, README): `Cume°`.
- **Menu lateral:** o logo e, abaixo dele, só "Personal Life OS". O lema "Foco · Clareza · Ação" **sai do menu** e aparece só no login e no README.
- **Topo no celular:** só o logo, sem subtítulo.
- **Título da aba:** `Cume° · <nome da tela>`.

Crie um componente `BrandMark` (com as props `size` e `subtitle?: boolean`, e `aria-label="Cume°"`) e use-o em todos os lugares da seção 6. O tamanho vem do `font-size`. Nada de `transform: scale`.

## 2. Cores (`src/styles.css`)
Troque a cor principal `#c9a77c` por **`#c8a97e`**, que é idêntica à do ícone. Organize as cores como variáveis. Mantenha os nomes que já existem se eles forem usados no código, e crie apelidos com os nomes abaixo:

```css
:root{
  /* marca */
  --color-gold:#c8a97e; --color-gold-light:#e9cf9f; --color-gold-ink:#17130c; --color-gold-soft:rgba(200,169,126,.16);
  /* fundo e superfícies */
  --color-bg:#0a0f1f; --color-sidebar:#090d1b; --color-surface:#0e1430; --color-surface-2:#121a38;
  --color-input:#0a0f24; --color-border:#26305a; --color-border-strong:#33406e;
  /* texto e estados */
  --color-text:#e8e6f1; --color-text-2:#c9cde0; --color-muted:#9aa2c2;
  --color-success:#7fb8a0; --color-danger:#d9786a; --color-warning:#d9945a; --color-info:#7da0c9;
  /* áreas da vida */
  --area-academica:#8f8cc4; --area-profissional:#7da0c9; --area-saude:#7fb8a0;
  --area-pessoal:#d197ae; --area-financeiro:#c8ac68; --area-adultices:#d29d72;
}
```

Procure cores fixas espalhadas pelo código (`#c9a77c` e parecidas) e troque pelas variáveis. Mantenha a cor de imprevisto em `--color-warning`.

## 3. Fontes
- Mantenha a **Source Serif 4** nos títulos e números, e a **fonte do sistema** no texto. Carregue também a **itálica 400** da Source Serif 4, porque o logo usa.
- Use `font-display: swap` e `font-synthesis: none`, para o navegador não criar um itálico falso.
- Coloque a escala em `rem` e `clamp()`, como na p. 6 do guia:
  - título de tela: `clamp(1.75rem, 1.2rem + 2vw, 2.6rem)`;
  - título de card: `1.15rem`;
  - número de indicador: `clamp(1.6rem, 1.2rem + 1vw, 2rem)`;
  - rótulo: `0.6875rem`, 700, espaçamento `.16em`, maiúsculas.
- Nada de `vw` puro, `zoom`, `scale` ou `scaleX` em texto.

## 4. Ícones e manifest
1. Copie os ícones para `public/icons/` com o prefixo `cume-`:
   - `cume-192.png`, `cume-512.png`, `cume-maskable-192.png` e `cume-maskable-512.png`;
   - `public/apple-touch-icon-cume.png`;
   - `public/favicon.ico` e `public/favicon.svg`.
   Nomes novos impedem que o cache mostre o ícone antigo.
2. No manifest (arquivo ou `vite-plugin-pwa`):
   - `name: "Cume° · Personal Life OS"`, `short_name: "Cume°"`, `description`;
   - `theme_color` e `background_color` como `#0a0f1f`;
   - `icons` com `purpose: "any"` e `purpose: "maskable"`.
3. **Não altere `start_url` nem `scope`.** Se não existir `id`, crie um com o **mesmo valor do `start_url` atual**, para o app instalado continuar sendo reconhecido como o mesmo.
4. No `index.html`:
   - `<title>`, `application-name` e `apple-mobile-web-app-title` com `Cume°`;
   - `theme-color` com `#0a0f1f`;
   - os `link rel="icon"` (`.ico` e `.svg`) e o `apple-touch-icon`;
   - as tags Open Graph, se existirem.

## 5. Cenários de montanha (p. 7 a 9 do guia)
1. Copie `docs/brand/cume-cenarios/*` para `public/scenes/`.
2. Crie um hook `useScene()`. Ele devolve `amanhecer`, `dia`, `entardecer` ou `noite` pela hora local:
   - 05h–10h: amanhecer;
   - 10h–16h: dia;
   - 16h–19h: entardecer;
   - 19h–05h: noite.

   O hook se atualiza quando o horário muda de faixa. A usuária também pode fixar uma cena em **Configurações → Cenário** (Automático · Amanhecer · Dia · Entardecer · Noite). Guarde essa preferência junto das outras configurações que já existem, numa chave **nova**, sem renomear as atuais.
3. **Topo das telas** (o mesmo lugar do cenário atual, no Layout):
   - fundo com `image-set()`, em WebP e com JPG de reserva;
   - degradê para `--color-bg` na parte de baixo;
   - `background-size: cover` e `background-position: 66% 40%`, para o cume nunca ser cortado;
   - altura `clamp(220px, 32vw, 300px)`;
   - abaixo de 768px, use `hero-mobile` com `background-position: 60% 30%`.
4. **Login:** cenário em tela cheia (`login` ou `login-mobile`). Por cima dele vai um cartão com `rgba(10,15,31,.74)` e borda `--color-border`, contendo o `BrandMark`, "Personal Life OS", o formulário e o lema.
5. **Modo foco** (da etapa 3): a mesma cena fica atrás, coberta por uma camada `--color-bg` com 70% de opacidade.
6. **Desempenho e acessibilidade:**
   - carregue só a cena do momento, com `<link rel="preload" as="image">` para a do topo;
   - ao trocar de cena, faça um fade de 1,2s, desligado se `prefers-reduced-motion` estiver ativo;
   - a imagem é decorativa, então use `aria-hidden` e não coloque texto nela;
   - o texto por cima continua com `--color-text` e contraste AA.
7. Remova o cenário antigo só depois que nada mais apontar para ele.

## 6. Onde o nome aparece (troque tudo de uma vez)
- título da aba;
- nome do app instalado;
- ícones e favicon;
- tela de login;
- menu lateral;
- topo do celular;
- README, com o logo, o lema e uma prévia dos cenários.

Procure "MeuPlano", "Meu Plano" e o logo antigo em todo o código.

## 7. O que NÃO mudar
- **O nome do banco `meuplano`**, as chaves de localStorage e os nomes de stores. Se alguma constante tiver esse nome, deixe um comentário: `// nome histórico, não alterar: guarda os dados da usuária`.
- `start_url` e `scope`.
- O nome da usuária em "Olá, Alexia" e no perfil.
- **O endereço do site.** Não troque `meuplano-rouge.vercel.app` neste passo:
  - Se os dados ficam no navegador (IndexedDB ou localStorage), cada endereço tem um armazenamento separado. Num endereço novo, o app abriria vazio, e o app instalado continuaria no endereço antigo.
  - Um endereço novo só pode entrar como domínio **extra**, depois de existir "Exportar/Importar backup" e de eu migrar os dados.
  - Antes de qualquer mudança de endereço, me diga se os dados estão só no navegador ou também num servidor.
- O **nome do repositório** no GitHub pode mudar, se eu pedir: o GitHub redireciona o nome antigo. Depois de mudar, confira se a Vercel continua conectada.

## 8. Testar antes de publicar
- `npm run build` e `npm run preview` sem erros.
- DevTools → Application → Manifest: nome, ícones e maskable aparecem sem avisos. O Lighthouse marca o app como "Installable".
- Abra o app numa versão antiga com dados de teste. Atualize para a nova versão e confira que **todos os dados e anexos continuam lá**.
- Confira as 4 cenas, trocando a hora do sistema ou fixando a cena nas Configurações, em 360px, 768px e 1280px de largura. O texto não pode aparecer esticado em nenhuma largura.
- Confira o login, o menu lateral (aberto e recolhido) e o modo foco com o cenário.

## 9. Publicar
- Faça um commit só com este passo: `feat(brand): identidade Cume° — nome, ícone, cores e cenários`.
- Me mostre um resumo e **espere meu ok** antes de publicar pelo fluxo de deploy de sempre.
- Depois do deploy, me diga o que conferir no celular:
  - no Android, o ícone e o nome na tela inicial se atualizam sozinhos, mas o Chrome pode levar um tempo para buscar o manifest novo;
  - no iPhone, o ícone só muda se eu remover o app da tela inicial e adicionar de novo pelo Safari, e os dados continuam.

## Critérios de aceite
- [ ] Nenhum "MeuPlano" visível. O `BrandMark` aparece no menu, no login e no topo do celular, com o alvo no lugar do grau.
- [ ] As cores vêm das variáveis. A cor `#c9a77c` não aparece mais no código.
- [ ] A Source Serif 4 Italic carrega corretamente, sem itálico falso, e nenhum texto aparece esticado.
- [ ] O manifest é válido, com os ícones novos, o mesmo `start_url` e `scope`, e um `id` definido.
- [ ] O cenário muda pelo horário, pode ser fixado nas Configurações e aparece no topo, no login e no modo foco.
- [ ] Os dados e anexos da versão antiga continuam intactos. O banco `meuplano` e o endereço do site não mudaram.
