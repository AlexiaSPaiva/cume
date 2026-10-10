import type { Area, AreaId } from './types';

export const AREAS: Area[] = [
  { id: 'academica', name: 'Acadêmica', color: '#9b93c9', tagline: 'Faculdade, pesquisa e biblioteca.' },
  { id: 'profissional', name: 'Profissional', color: '#7ea3cc', tagline: 'Trabalho, candidaturas e carreira.' },
  { id: 'saude', name: 'Saúde', color: '#7fb8a0', tagline: 'Como você quer se sentir: leve, forte, confortável.' },
  { id: 'pessoal', name: 'Pessoal', color: '#d4a0b4', tagline: 'O que é seu, sem pressão.' },
  { id: 'financeiro', name: 'Financeiro', color: '#c9b06a', tagline: 'Conta dos sonhos: hoje e visão futura, no mesmo painel.' },
  { id: 'adultices', name: 'Adultices', color: '#d29b72', tagline: 'Documentos, comprovantes e burocracias.' },
];

export const AREA: Record<AreaId, Area> = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, Area>;

export const IMPREVISTO_COLOR = '#d9915a';

export function zeroByArea(): Record<AreaId, number> {
  return { academica: 0, profissional: 0, saude: 0, pessoal: 0, financeiro: 0, adultices: 0 };
}
