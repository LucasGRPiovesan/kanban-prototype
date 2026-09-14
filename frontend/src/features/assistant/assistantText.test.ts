import { describe, expect, it } from 'vitest';
import type { PermissionCode } from '@/lib/api/types';
import { answerForClipboard, demandUuidFromHref, paragraphsToHtml } from './assistantText';
import { availableShortcuts, progressSteps } from './shortcuts';

const UUID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('assistant text', () => {
  it('turns a draft into description markup, escaping what the model wrote', () => {
    expect(
      paragraphsToHtml('Permitir redefinir a senha <b>já</b>.\nPor e-mail.\n\n- Token expira\n- Link único\nFim & pronto'),
    ).toBe(
      '<p>Permitir redefinir a senha &lt;b&gt;já&lt;/b&gt;.<br>Por e-mail.</p><ul><li>Token expira</li><li>Link único</li></ul><p>Fim &amp; pronto</p>',
    );
    expect(paragraphsToHtml('  \n\n ')).toBe('');
  });

  it('recognises only the citation links the server builds', () => {
    expect(demandUuidFromHref(`/kanban?demanda=${UUID}`)).toBe(UUID);
    expect(demandUuidFromHref('https://phishing.example/kanban?demanda=x')).toBeNull();
    expect(demandUuidFromHref(`/kanban?demanda=${UUID}&x=1`)).toBeNull();
    expect(demandUuidFromHref(null)).toBeNull();
  });

  it('copies an answer as plain text, with each citation as its title', () => {
    expect(answerForClipboard('Riscos', `Atacar [Tela de login](/kanban?demanda=${UUID}) hoje.`)).toBe(
      'Riscos\n\nAtacar Tela de login hoje.',
    );
  });
});

describe('assistant shortcuts', () => {
  const canWith = (held: PermissionCode[]) => (permission: PermissionCode) => held.includes(permission);

  it('offers only what the profile could apply', () => {
    const reader = availableShortcuts(canWith(['DEMAND_ACCESS'])).map((shortcut) => shortcut.action);
    expect(reader).toEqual(['EXECUTIVE_REPORT', 'DAILY_SUMMARY', 'RISK_ANALYSIS']);

    const manager = availableShortcuts(canWith(['DEMAND_ACCESS', 'DEMAND_CREATE', 'DEMAND_UPDATE']));
    expect(manager).toHaveLength(5);
    expect(availableShortcuts(canWith([]))).toEqual([]);
  });

  it('narrates the steps of the request being made', () => {
    expect(progressSteps({ prompt: 'status?' })[0]).toBe('Entendendo o pedido');
    expect(progressSteps({ action: 'CREATE_DEMAND' })).toContain('Conferindo projeto, responsável e prazo');
  });
});
