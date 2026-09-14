import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_UUIDS, seedAssistantApiKey } from '../../prisma/seed-data';
import { loadEnv } from '../../src/config/env';
import { createApp } from '../../src/main/app';
import { buildDependencies } from '../../src/main/composition-root';
import {
  type LanguageModel,
  LanguageModelError,
  type LanguageModelProvider,
  type LanguageModelRequest,
} from '../../src/modules/assistant/application/ports';
import { type AssistantSettingsState } from '../../src/modules/assistant/domain/assistant-settings';

const API = '/api/v1';

type Reply = string | LanguageModelError | ((request: LanguageModelRequest) => string);

/** A scripted model: records every request and answers from a queue — never the network. */
class ScriptedModels implements LanguageModelProvider {
  readonly requests: LanguageModelRequest[] = [];
  private replies: Reply[] = [];

  script(...replies: Reply[]): void {
    this.replies = replies;
    this.requests.length = 0;
  }

  connect(settings: AssistantSettingsState): LanguageModel {
    return {
      model: settings.model,
      generate: async (modelRequest) => {
        this.requests.push(modelRequest);
        const next = this.replies.shift();
        if (next === undefined) {
          throw new Error('Chamada inesperada ao modelo.');
        }
        if (next instanceof LanguageModelError) {
          throw next;
        }
        return {
          text: typeof next === 'function' ? next(modelRequest) : next,
          model: settings.model,
          usage: { inputTokens: 100, outputTokens: 50 },
        };
      },
    };
  }
}

/** The short reference (D3, P1, U2) the prompt gave to a demand, project or person. */
function refOf(prompt: string, label: string, prefix: 'D' | 'P' | 'U'): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const separator = prefix === 'U' ? ' ' : ' \\| ';
  const match = new RegExp(`(${prefix}\\d+)${separator}${escaped}`).exec(prompt);
  if (!match) {
    throw new Error(`Referência de "${label}" ausente no prompt.`);
  }
  return match[1]!;
}

let app: Express;
let prisma: PrismaClient;
const models = new ScriptedModels();
const cookie = { admin: '', agilista: '', dev: '' };
let restore: () => Promise<void> = async () => undefined;

async function login(userUuid: string): Promise<string> {
  const response = await request(app).post(`${API}/auth/login`).send({ userUuid });
  expect(response.status).toBe(200);
  const cookies = response.headers['set-cookie'] as unknown as string[];
  return cookies.map((value) => value.split(';')[0]).join('; ');
}

const command = (session: string, body: Record<string, unknown>) =>
  request(app).post(`${API}/assistant/commands`).set('Cookie', session).send(body);

const patchSettings = (session: string, body: Record<string, unknown>) =>
  request(app).patch(`${API}/assistant/settings`).set('Cookie', session).send(body);

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const env = loadEnv();
  prisma = new PrismaClient();
  app = createApp(env, buildDependencies(env, prisma, { languageModels: models }));

  // The suite needs an enabled, keyed configuration. A real one is left as it was found —
  // the scripted provider never reads the key — and a missing one is created and removed.
  const existing = await prisma.assistantSettings.findUnique({ where: { scope: 'GLOBAL' } });
  if (existing) {
    // A keyless installation (seeded without SEED_ASSISTANT_API_KEY) gets a placeholder
    // key for the duration of the suite; the scripted provider never decrypts it.
    await prisma.assistantSettings.update({
      where: { scope: 'GLOBAL' },
      data: {
        enabled: true,
        ...(existing.apiKeyCiphertext
          ? {}
          : { apiKeyCiphertext: 'v1:teste:teste:teste', apiKeyPreview: 'test' }),
      },
    });
    restore = async () => {
      await prisma.assistantSettings.update({
        where: { scope: 'GLOBAL' },
        data: {
          enabled: existing.enabled,
          model: existing.model,
          apiKeyCiphertext: existing.apiKeyCiphertext,
          apiKeyPreview: existing.apiKeyPreview,
        },
      });
    };
  } else {
    await prisma.assistantSettings.create({
      data: {
        uuid: '5e6f7081-0099-4a51-9d3e-2c7f4a5b6c99',
        scope: 'GLOBAL',
        provider: 'GEMINI',
        model: 'gemini-3.5-flash-lite',
        apiKeyCiphertext: 'v1:teste:teste:teste',
        apiKeyPreview: 'test',
      },
    });
    restore = async () => {
      await prisma.assistantSettings.delete({ where: { scope: 'GLOBAL' } });
    };
  }

  cookie.admin = await login(SEED_UUIDS.users.marianaAlves);
  cookie.agilista = await login(SEED_UUIDS.users.joanaMartins);
  cookie.dev = await login(SEED_UUIDS.users.lucasBarbosa);
});

afterAll(async () => {
  await restore();
  await prisma.$disconnect();
});

describe('Assistente de IA', () => {
  it('reports its state to every profile, and the configuration only to managers — never the key', async () => {
    const dev = await request(app).get(`${API}/assistant`).set('Cookie', cookie.dev);
    expect(dev.status).toBe(200);
    expect(dev.body.data).toMatchObject({ enabled: true, configured: true, management: null });

    const admin = await request(app).get(`${API}/assistant`).set('Cookie', cookie.admin);
    expect(admin.body.data.management.models.length).toBeGreaterThan(0);
    const payload = JSON.stringify(admin.body);
    const seedKey = seedAssistantApiKey();
    if (seedKey) {
      expect(payload).not.toContain(seedKey);
    }
    expect(payload).not.toMatch(/"v1:/);
  });

  it('grounds an answer on the demands the asker can see, and links only those', async () => {
    models.script(
      (modelRequest) =>
        `A mais urgente é [[${refOf(modelRequest.prompt, 'Implementar tela de login', 'D')}]]. Veja [aqui](https://phishing.example) e [[D999]].`,
    );

    const response = await command(cookie.dev, { action: 'ASK_BOARD', prompt: 'O que está mais urgente?' });

    expect(response.status).toBe(200);
    const prompt = models.requests[0]!.prompt;
    expect(prompt).toContain('Implementar tela de login');
    // Plataforma de Dados is not one of his projects: its demands never reach the model.
    expect(prompt).not.toContain('Painel executivo de faturamento');

    const login = await prisma.demand.findFirstOrThrow({
      where: { title: 'Implementar tela de login' },
      select: { uuid: true },
    });
    const { data } = response.body;
    expect(data.markdown).toContain(`(/kanban?demanda=${login.uuid})`);
    expect(data.markdown).not.toContain('phishing.example');
    expect(data.citations).toEqual([{ uuid: login.uuid, title: 'Implementar tela de login' }]);
    expect(data.meta).toMatchObject({ classified: false, project: null });
  });

  it('drafts a demand checked against projects and eligibility — and creates nothing', async () => {
    const before = await prisma.demand.count();
    models.script((modelRequest) =>
      JSON.stringify({
        title: 'Implementar recuperação de senha',
        description: 'Permitir redefinir a senha por e-mail.',
        projectRef: refOf(modelRequest.prompt, 'Portal do Cliente', 'P'),
        responsibleRef: refOf(modelRequest.prompt, 'Sofia Lima Braga', 'U'),
        dueDate: '2020-01-01',
        checklist: ['Enviar e-mail', 'enviar e-mail', 'Validar token'],
        assumptions: [],
      }),
    );

    const response = await command(cookie.agilista, {
      action: 'CREATE_DEMAND',
      prompt: 'Recuperação de senha no portal com a Sofia para ontem',
    });

    expect(response.status).toBe(200);
    const { draft } = response.body.data;
    expect(draft.project).toEqual({ uuid: SEED_UUIDS.projects.portalCliente, name: 'Portal do Cliente' });
    // Sofia is eligible only in Plataforma de Dados, and the date is in the past.
    expect(draft.responsible).toBeNull();
    expect(draft.dueDate).toBeNull();
    expect(draft.checklist).toEqual(['Enviar e-mail', 'Validar token']);
    expect(draft.notes.join(' ')).toContain('Sofia Lima Braga não pode ser responsável');
    expect(await prisma.demand.count()).toBe(before);
  });

  it('refuses an explicit action the profile could not apply, before spending a model call', async () => {
    models.script();
    const response = await command(cookie.dev, { action: 'CREATE_DEMAND', prompt: 'Criar demanda de logout' });
    expect(response.status).toBe(403);
    expect(models.requests).toHaveLength(0);
  });

  it('classifies free text before answering it', async () => {
    models.script(JSON.stringify({ action: 'EXECUTIVE_REPORT', demandRef: null }), '### Leitura geral\nSob controle.');

    const response = await command(cookie.admin, { prompt: 'me dá um status report pra diretoria' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ action: 'EXECUTIVE_REPORT', title: 'Relatório executivo' });
    expect(response.body.data.meta.classified).toBe(true);
    expect(models.requests).toHaveLength(2);
    expect(models.requests[1]!.prompt).toContain('Entregas no período');
  });

  it('explains, instead of refusing, when free text asks for what the profile cannot do', async () => {
    models.script(JSON.stringify({ action: 'CREATE_DEMAND', demandRef: null }));
    const response = await command(cookie.dev, { prompt: 'cria uma demanda de logout' });
    expect(response.status).toBe(200);
    expect(response.body.data.action).toBe('CLARIFY');
    expect(models.requests).toHaveLength(1);
  });

  it('plans a checklist without repeating existing items, on reachable demands only', async () => {
    const login = await prisma.demand.findFirstOrThrow({
      where: { title: 'Implementar tela de login' },
      include: { checklist: true },
    });
    const existing = login.checklist[0]!.title;
    models.script(
      JSON.stringify({ items: [existing.toUpperCase(), 'Escrever testes de integração do login'], rationale: 'Do fluxo à validação.' }),
    );

    const response = await command(cookie.dev, { action: 'PLAN_CHECKLIST', demandUuid: login.uuid });

    expect(response.status).toBe(200);
    expect(response.body.data.plan.items).toEqual(['Escrever testes de integração do login']);
    expect(response.body.data.demand.uuid).toBe(login.uuid);

    const hidden = await prisma.demand.findFirstOrThrow({
      where: { title: 'Painel executivo de faturamento' },
      select: { uuid: true },
    });
    models.script();
    expect((await command(cookie.dev, { action: 'PLAN_CHECKLIST', demandUuid: hidden.uuid })).status).toBe(404);
    expect((await command(cookie.dev, { action: 'EXECUTIVE_REPORT', projectUuid: SEED_UUIDS.projects.dataPlatform })).status).toBe(404);
    expect(models.requests).toHaveLength(0);
  });

  it('turns provider failures into answers a person can act on', async () => {
    models.script(new LanguageModelError('QUOTA', 'quota', { status: 429, retryAfterSeconds: 31 }));
    const quota = await command(cookie.agilista, { action: 'RISK_ANALYSIS' });
    expect(quota.status).toBe(429);
    expect(quota.body.error.code).toBe('ASSISTANT_QUOTA_EXCEEDED');
    expect(quota.headers['retry-after']).toBe('31');

    models.script('isto não é json');
    const invalid = await command(cookie.agilista, { action: 'CREATE_DEMAND', prompt: 'Criar demanda de teste' });
    expect(invalid.status).toBe(503);
    expect(invalid.body.error.code).toBe('ASSISTANT_INVALID_RESPONSE');
  });

  it('keeps configuration to ASSISTANT_MANAGE, audits it, and honours a disabled assistant', async () => {
    expect((await patchSettings(cookie.agilista, { enabled: false })).status).toBe(403);
    const unknown = await patchSettings(cookie.admin, { model: 'gpt-4o' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe('ASSISTANT_MODEL_UNKNOWN');

    const audited = await prisma.log.count({ where: { action: 'assistant.settings_updated' } });
    try {
      const disabled = await patchSettings(cookie.admin, { enabled: false });
      expect(disabled.status).toBe(200);
      expect(disabled.body.data.enabled).toBe(false);
      expect(await prisma.log.count({ where: { action: 'assistant.settings_updated' } })).toBe(audited + 1);

      models.script();
      const refused = await command(cookie.dev, { action: 'EXECUTIVE_REPORT' });
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('ASSISTANT_DISABLED');
      expect(models.requests).toHaveLength(0);
    } finally {
      await patchSettings(cookie.admin, { enabled: true });
    }
  });
});
