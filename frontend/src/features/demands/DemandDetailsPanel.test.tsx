import { describe, expect, it } from 'vitest';
import { fieldLockReason } from './DemandDetailsPanel';

/**
 * The priority between the three reasons a field can be locked — a demand in
 * produção, no DEMAND_UPDATE at all, or missing that one field's own permission — is
 * the part of this feature most likely to silently drift as the panel grows. Each case
 * is fixed here on its own, in the order the function itself checks them.
 */
describe('fieldLockReason', () => {
  it('says nothing is locked when DEMAND_UPDATE is enough and the field needs no more', () => {
    expect(fieldLockReason({ isTerminal: false, hasUpdate: true })).toBeUndefined();
  });

  it('says nothing is locked once the field-specific permission is also held', () => {
    expect(
      fieldLockReason({
        isTerminal: false,
        hasUpdate: true,
        hasFieldPermission: true,
        fieldNoun: 'a prioridade',
      }),
    ).toBeUndefined();
  });

  it('blames produção first, even without DEMAND_UPDATE or the field permission', () => {
    expect(
      fieldLockReason({
        isTerminal: true,
        hasUpdate: false,
        hasFieldPermission: false,
        fieldNoun: 'o prazo',
      }),
    ).toBe('Demanda em produção');
  });

  it('blames the missing DEMAND_UPDATE next, before any field-specific permission', () => {
    expect(
      fieldLockReason({
        isTerminal: false,
        hasUpdate: false,
        hasFieldPermission: false,
        fieldNoun: 'o responsável',
      }),
    ).toBe('Você não tem permissão para gerenciar demandas');
  });

  it('names the missing field permission last, once produção and DEMAND_UPDATE are both fine', () => {
    expect(
      fieldLockReason({
        isTerminal: false,
        hasUpdate: true,
        hasFieldPermission: false,
        fieldNoun: 'o projeto',
      }),
    ).toBe('Você não tem permissão para alterar o projeto');
  });

  it('blames archived before everything else — it overrides every permission', () => {
    expect(
      fieldLockReason({
        archived: true,
        isTerminal: true,
        hasUpdate: false,
        hasFieldPermission: false,
        fieldNoun: 'o responsável',
      }),
    ).toBe('Demanda arquivada — desarquive para gerenciar');
  });
});
