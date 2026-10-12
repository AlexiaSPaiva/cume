import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTopics } from '../../src/lib/study';

describe('tópicos colados do edital', () => {
  const edital = readFileSync('tests/fixtures/edital-historia.txt', 'utf-8');

  it('só os itens numerados viram tópicos; os títulos com subitens viram seções', () => {
    const t = parseTopics(edital);
    expect(t).toHaveLength(38); // 5 + 6 + 4 + 7 + 5 + 5 + 6
    expect(t[0]).toEqual({ code: '1.1', name: 'Os povos do Oriente Próximo e suas organizações políticas.', section: 'Antiguidade' });
    expect(t.map((x) => x.name)).not.toContain('ANTIGUIDADE');
    expect([...new Set(t.map((x) => x.section))]).toEqual([
      'Antiguidade', 'Mundo Medieval', 'Mundo Moderno', 'Mundo Contemporâneo', 'Brasil Colônia', 'Brasil Império', 'Brasil República',
    ]);
  });

  it('o ";" dentro do tópico não quebra o tópico', () => {
    const t = parseTopics(edital);
    expect(t.find((x) => x.code === '2.2')?.name).toBe('A organização política feudal; os reinos cristãos da Península Ibérica.');
  });

  it('linhas sem número são ignoradas, menos a continuação de um tópico quebrado (PDF)', () => {
    const t = parseTopics('CONHECIMENTOS ESPECÍFICOS\nPágina 12 de 40\n1. Direito\n1.1. Princípios da administração\npública e poderes.\n1.2. Atos administrativos.\nObservação: bibliografia sugerida');
    expect(t.map((x) => x.name)).toEqual(['Princípios da administração pública e poderes.', 'Atos administrativos.']);
  });

  it('sem numeração continua como antes: um por linha ou separados por ;', () => {
    expect(parseTopics('Crase\nRegência; Concordância').map((x) => x.name)).toEqual(['Crase', 'Regência', 'Concordância']);
  });

  it('lista numerada simples (sem subitens): cada item é um tópico', () => {
    expect(parseTopics('1. Crase\n2. Regência\n3) Concordância').map((x) => [x.code, x.name])).toEqual([['1', 'Crase'], ['2', 'Regência'], ['3', 'Concordância']]);
  });
});
