import { describe, expect, it } from 'vitest';
import { matchSegments, matchesSearch, normalizeForSearch } from './textMatch';

describe('normalizeForSearch', () => {
  it('strips accents and lower-cases, keeping length stable', () => {
    expect(normalizeForSearch('Produção')).toBe('producao');
    expect(normalizeForSearch('Produção').length).toBe('Produção'.length);
  });
});

describe('matchesSearch', () => {
  it('matches across accents and case', () => {
    expect(matchesSearch('producao', 'Em Produção')).toBe(true);
    expect(matchesSearch('PRODUÇÃO', 'em producao')).toBe(true);
  });

  it('matches a substring anywhere, not only at the start', () => {
    expect(matchesSearch('cadastro', 'Revisar fluxo de cadastro')).toBe(true);
  });

  it('treats an empty term as matching everything', () => {
    expect(matchesSearch('  ', 'qualquer coisa')).toBe(true);
  });

  it('checks every field given, matching if any one does', () => {
    expect(matchesSearch('joana', 'Revisar fluxo de cadastro', 'André Carvalho')).toBe(false);
    expect(matchesSearch('andre', 'Revisar fluxo de cadastro', 'André Carvalho')).toBe(true);
  });

  it('does not match a term absent from every field', () => {
    expect(matchesSearch('inexistente', 'Revisar fluxo de cadastro', 'André Carvalho')).toBe(false);
  });
});

describe('matchSegments', () => {
  it('returns the whole text unmatched for an empty term', () => {
    expect(matchSegments('Revisar fluxo', '')).toEqual([{ text: 'Revisar fluxo', matched: false }]);
  });

  it('splits into matched and unmatched runs, preserving original accents', () => {
    expect(matchSegments('Em Produção agora', 'producao')).toEqual([
      { text: 'Em ', matched: false },
      { text: 'Produção', matched: true },
      { text: ' agora', matched: false },
    ]);
  });

  it('marks every occurrence, not only the first', () => {
    expect(matchSegments('cadastro de cadastro', 'cadastro')).toEqual([
      { text: 'cadastro', matched: true },
      { text: ' de ', matched: false },
      { text: 'cadastro', matched: true },
    ]);
  });

  it('returns one unmatched segment when nothing matches', () => {
    expect(matchSegments('Revisar fluxo', 'xyz')).toEqual([
      { text: 'Revisar fluxo', matched: false },
    ]);
  });
});
