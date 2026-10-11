import type { Area, AreaId } from './types';

/** cores = tokens --area-* do styles.css (guia Cume°, p. 5); aqui em hex porque o SVG dos gráficos usa o valor direto */
export const AREAS: Area[] = [
  { id: 'academica', name: 'Acadêmica', color: '#8f8cc4', tagline: 'Faculdade, pesquisa e biblioteca.' },
  { id: 'profissional', name: 'Profissional', color: '#7da0c9', tagline: 'Trabalho, candidaturas e carreira.' },
  { id: 'saude', name: 'Saúde', color: '#7fb8a0', tagline: 'Como você quer se sentir: leve, forte, confortável.' },
  { id: 'pessoal', name: 'Pessoal', color: '#d197ae', tagline: 'O que é seu, sem pressão.' },
  { id: 'financeiro', name: 'Financeiro', color: '#c8ac68', tagline: 'Conta dos sonhos: hoje e visão futura, no mesmo painel.' },
  { id: 'adultices', name: 'Adultices', color: '#d29d72', tagline: 'Documentos, comprovantes e burocracias.' },
];

export const AREA: Record<AreaId, Area> = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, Area>;

// mesmo valor de --color-warning no styles.css
export const IMPREVISTO_COLOR = '#d9945a';

export function zeroByArea(): Record<AreaId, number> {
  return { academica: 0, profissional: 0, saude: 0, pessoal: 0, financeiro: 0, adultices: 0 };
}
