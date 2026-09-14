import { describe, expect, it } from 'vitest';
import { ArrowRightLeft, MessageSquare, PencilLine } from 'lucide-react';
import type { AppNotification } from '@/lib/api/types';
import {
  canOpenNotificationDemand,
  notificationIcon,
  notificationSentence,
} from './notificationPresentation';

const base: AppNotification = {
  uuid: 'n1',
  reason: 'RESPONSIBLE',
  action: 'demand.status_changed',
  summary: 'Moveu a demanda "Login" de Não iniciada para Em andamento',
  demand: { uuid: 'd1', title: 'Login' },
  projectName: 'Portal',
  actor: { uuid: 'u1', name: 'Ana Souza' },
  changes: [],
  readAt: null,
  createdAt: '2026-09-13T10:00:00.000Z',
};

describe('notificationSentence', () => {
  it('leads with the actor name, lower-casing the stored summary', () => {
    expect(notificationSentence(base)).toBe(
      'Ana Souza moveu a demanda "Login" de Não iniciada para Em andamento',
    );
  });

  it('falls back to the summary when no actor is known', () => {
    expect(notificationSentence({ ...base, actor: null })).toBe(base.summary);
  });
});

describe('notificationIcon', () => {
  it('maps each kind of change to its icon', () => {
    expect(notificationIcon('demand.status_changed')).toBe(ArrowRightLeft);
    expect(notificationIcon('demand.comment_added')).toBe(MessageSquare);
    expect(notificationIcon('demand.updated')).toBe(PencilLine);
  });
});

describe('canOpenNotificationDemand', () => {
  it('refuses only deleted demands', () => {
    expect(canOpenNotificationDemand(base)).toBe(true);
    expect(canOpenNotificationDemand({ ...base, action: 'demand.deleted' })).toBe(false);
  });
});
