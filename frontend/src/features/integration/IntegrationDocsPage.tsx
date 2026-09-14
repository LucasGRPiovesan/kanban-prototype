import { type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ExternalLink, KeyRound, Plug, Shield } from 'lucide-react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';

const API_BASE = 'http://localhost:3333/api/v1';

interface Section {
  id: string;
  label: string;
  render: () => ReactNode;
}

const SECTIONS: Section[] = [
  { id: 'visao-geral', label: 'Visão geral', render: VisaoGeral },
  { id: 'autenticacao', label: 'Autenticação', render: Autenticacao },
  { id: 'criar-demanda', label: 'Criar demanda', render: CriarDemanda },
  { id: 'atualizar-demanda', label: 'Atualizar demanda', render: AtualizarDemanda },
  { id: 'mover-status', label: 'Mover status', render: MoverStatus },
  { id: 'seguranca-erros', label: 'Segurança e erros', render: SegurancaErros },
];

/**
 * The demand-integration API, documented the way a third party would actually read it.
 *
 * Two credentials by design, the same shape as an OAuth2 Client Credentials Grant used
 * by Stripe, Twilio and most platform APIs that hand a customer machine access rather
 * than a login: an **API key** (public, safe to display) and a **secret** (shown once,
 * at generation) exchanged for a short-lived **access token** that actually authorizes
 * requests. See `docs/ADDED_REQUIREMENTS.md` for why this shape and not a long-lived
 * static key on every request.
 */
export function IntegrationDocsPage() {
  const [params, setParams] = useSearchParams();
  const activeId = params.get('secao') ?? SECTIONS[0]!.id;
  const active = SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0]!;

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title="Integração"
          badge={<EnhancementBadge label="Sugestão" />}
          description="Crie e atualize demandas a partir de um sistema externo, com credenciais por projeto."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Integração' }]}
        />

        <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <nav aria-label="Seções" className="mb-6 lg:sticky lg:top-6 lg:mb-0">
            <ul className="stagger-tight space-y-1">
              {SECTIONS.map((section) => {
                const isActive = section.id === active.id;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => setParams({ secao: section.id })}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors duration-150',
                        isActive
                          ? 'bg-brand-100 text-brand-800'
                          : 'text-muted hover:bg-surface-muted hover:text-body',
                      )}
                    >
                      {section.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article className="prose-docs min-w-0">{active.render()}</article>
        </div>
      </div>
    </PageShell>
  );
}

function VisaoGeral() {
  return (
    <>
      <h1>Visão geral</h1>
      <p>
        A integração é um recurso <strong>exclusivo de cada projeto</strong>. Um sistema
        externo — um ERP, um formulário de suporte, um pipeline de automação — pode abrir
        e atualizar demandas de um projeto específico sem que ninguém precise fazer login
        pela interface, contanto que tenha as credenciais daquele projeto.
      </p>
      <div className="flex items-start gap-3 rounded-lg border border-brand-300 bg-brand-50 p-4">
        <Plug className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
        <p className="text-sm text-body">
          As credenciais são geradas <strong>na tela de Projetos</strong>, não aqui — esta
          página é a documentação de como usá-las.{' '}
          <Link
            to="/projetos"
            className="inline-flex items-center gap-1 font-semibold text-brand-800 underline underline-offset-2"
          >
            Ir para Projetos <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>
      <h2 id="como-funciona">Como funciona</h2>
      <p>Três peças, cada uma com um papel diferente — o mesmo desenho que Stripe, Twilio e a maioria das APIs de plataforma usam para dar acesso de máquina a máquina:</p>
      <ol>
        <li><strong>API key</strong> — identifica o projeto. Pública: pode aparecer em logs, no código, em um ticket de suporte.</li>
        <li><strong>Secret</strong> — a senha da API key. Mostrado <strong>uma única vez</strong>, no momento em que é gerado; o servidor guarda apenas um hash e nunca o devolve de novo.</li>
        <li><strong>Access token</strong> — trocado por API key + secret, de curta duração (padrão 1 hora). É o que efetivamente autoriza cada chamada de criação ou edição de demanda.</li>
      </ol>
      <p>
        Nenhuma chamada de escrita usa a API key/secret diretamente — sempre o token.
        Isso limita o dano de um token vazado (ele expira sozinho, em pouco tempo) sem
        exigir que o sistema externo reenvie o secret em toda requisição.
      </p>
      <h2 id="isolamento">Isolamento por projeto</h2>
      <p>
        Um token só enxerga o projeto para o qual foi emitido. Tentar editar uma demanda
        de outro projeto responde <code>404</code>, exatamente como aconteceria com um
        usuário sem acesso àquele projeto — o isolamento nunca confirma que o uuid existe
        em outro lugar.
      </p>
    </>
  );
}

function Autenticacao() {
  return (
    <>
      <h1>Autenticação</h1>
      <h2 id="gerar-credenciais">1. Gerar as credenciais do projeto</h2>
      <p>
        Em <strong>Projetos → Integração</strong>, quem tiver a permissão
        {' '}<code>PROJECT_MANAGE_INTEGRATION</code> gera um novo par de API key e secret.
        Gerar substitui qualquer credencial anterior — o par antigo, e qualquer token
        emitido a partir dele, param de funcionar no mesmo instante.
      </p>
      <h2 id="trocar-por-token">2. Trocar por um access token</h2>
      <p>Sem sessão, sem cookie — a própria API key/secret é a credencial desta chamada:</p>
      <CodeBlock
        label="cURL"
        code={`curl -X POST ${API_BASE}/integration/auth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "apiKey": "csp_key_1a2b3c4d5e6f7890abcd1a2b3c4d5e6f7890abcd",
    "apiSecret": "csp_secret_9f8e7d6c5b4a..."
  }'`}
      />
      <CodeBlock
        label="Resposta"
        code={`{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
}`}
      />
      <h2 id="usar-o-token">3. Usar o token</h2>
      <p>
        Em toda chamada de criação, edição ou movimentação de demanda, no cabeçalho{' '}
        <code>Authorization</code>:
      </p>
      <CodeBlock label="Cabeçalho" code={'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...'} />
      <p>
        Quando o token expirar (<code>401 INTEGRATION_TOKEN_INVALID</code>), repita o
        passo 2 — não há renovação automática, de propósito: um token de vida curta que
        precisa ser buscado de novo é mais simples de revogar na prática do que um de
        vida longa "quase nunca" renovado.
      </p>
    </>
  );
}

function CriarDemanda() {
  return (
    <>
      <h1>Criar demanda</h1>
      <p>
        <code>POST /integration/demands</code> — o projeto nunca vem do corpo da
        requisição, apenas do token apresentado.
      </p>
      <CodeBlock
        label="cURL"
        code={`curl -X POST ${API_BASE}/integration/demands \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Corrigir divergência de estoque",
    "description": "Aberta automaticamente pelo ERP após a conciliação noturna.",
    "dueDate": "2026-12-31",
    "responsibleUuid": "1a2b3c4d-0005-4a51-9d3e-2c7f4a5b6c05"
  }'`}
      />
      <CodeBlock label="Resposta — 201 Created" code={`{\n  "data": { "uuid": "..." }\n}`} />
      <h2 id="campos">Campos</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Campo</th>
              <th>Obrigatório</th>
              <th>Descrição</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code>title</code></td><td>Sim</td><td>Título da demanda.</td></tr>
            <tr><td><code>description</code></td><td>Sim</td><td>Texto simples ou HTML básico — sanitizado no servidor, como na interface.</td></tr>
            <tr><td><code>dueDate</code></td><td>Sim</td><td>Data no formato <code>AAAA-MM-DD</code>.</td></tr>
            <tr><td><code>responsibleUuid</code></td><td>Sim</td><td>Uuid de um usuário ativo, alocado no projeto e cujo perfil concede <code>DEMAND_BE_ASSIGNEE</code> — a mesma regra da interface.</td></tr>
            <tr><td><code>status</code></td><td>Não</td><td>Qualquer status exceto <code>PRODUCTION</code> — uma demanda precisa percorrer o fluxo até a produção, não nascer nela. Sem informar, nasce como <code>NOT_STARTED</code>.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Como não há uma pessoa por trás da chamada, a demanda é registrada como criada
        <em> e</em> tendo como responsável o mesmo usuário informado — a mesma convenção
        que sistemas de chamados usam para um ticket aberto "em nome de" alguém.
      </p>
    </>
  );
}

function AtualizarDemanda() {
  return (
    <>
      <h1>Atualizar demanda</h1>
      <p>
        <code>PATCH /integration/demands/{'{uuid}'}</code> — todos os campos são
        opcionais; envie apenas o que muda.
      </p>
      <CodeBlock
        label="cURL"
        code={`curl -X PATCH ${API_BASE}/integration/demands/<uuid> \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Corrigir divergência de estoque — atualizado pelo ERP"
  }'`}
      />
      <CodeBlock label="Resposta — 200 OK" code={`{\n  "data": { "uuid": "..." }\n}`} />
      <p>
        Aceita <code>title</code>, <code>description</code>, <code>dueDate</code> e{' '}
        <code>responsibleUuid</code> — o mesmo conjunto da edição pela interface, exceto
        a transferência entre projetos, que a integração não expõe: um token pertence a
        um projeto só, e mudar o projeto de uma demanda é, por definição, uma decisão que
        atravessa esse limite.
      </p>
      <p>
        Uma demanda de outro projeto — mesmo que o uuid exista — responde{' '}
        <code>404 DEMAND_NOT_FOUND</code>, nunca <code>403</code>.
      </p>
    </>
  );
}

function MoverStatus() {
  return (
    <>
      <h1>Mover status</h1>
      <p>
        <code>PATCH /integration/demands/{'{uuid}'}/status</code> — a mesma máquina de
        estados do quadro Kanban.
      </p>
      <CodeBlock
        label="cURL"
        code={`curl -X PATCH ${API_BASE}/integration/demands/<uuid>/status \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \\
  -H "Content-Type: application/json" \\
  -d '{ "status": "IN_PROGRESS" }'`}
      />
      <p>
        Um dos cinco valores: <code>NOT_STARTED</code>, <code>IN_PROGRESS</code>,{' '}
        <code>PAUSED</code>, <code>IN_REVIEW</code>, <code>PRODUCTION</code>.{' '}
        <strong>Produção é terminal</strong> — qualquer tentativa de tirar uma demanda de
        lá responde <code>403 DEMAND_IN_PRODUCTION_IS_TERMINAL</code>, pela integração
        exatamente como pela interface.
      </p>
    </>
  );
}

function SegurancaErros() {
  return (
    <>
      <h1>Segurança e erros</h1>
      <h2 id="boas-praticas">Boas práticas</h2>
      <ul>
        <li>Guarde o <code>apiSecret</code> apenas no seu backend — nunca em um app de página única, aplicativo móvel ou qualquer código que chegue ao navegador de alguém.</li>
        <li>Trate um token de acesso como você trataria uma sessão: guarde-o em memória pelo tempo da sua validade, não em um banco de dados de longo prazo.</li>
        <li>Regenere as credenciais se suspeitar de vazamento — a substituição é imediata, sem precisar esperar nada expirar.</li>
        <li>Revogue a integração de um projeto que deixou de precisar dela.</li>
      </ul>
      <h2 id="erros">Erros mais comuns</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Status</th><th>Código</th><th>Significado</th></tr>
          </thead>
          <tbody>
            <tr><td>401</td><td><code>INTEGRATION_INVALID_CREDENTIALS</code></td><td>API key ou secret incorretos — a mensagem não diz qual dos dois.</td></tr>
            <tr><td>401</td><td><code>INTEGRATION_TOKEN_INVALID</code></td><td>Token expirado, malformado, ou emitido por uma credencial já rotacionada/revogada.</td></tr>
            <tr><td>404</td><td><code>DEMAND_NOT_FOUND</code></td><td>A demanda não existe, ou pertence a outro projeto.</td></tr>
            <tr><td>422</td><td><code>RESPONSIBLE_NOT_PROJECT_MEMBER</code></td><td>O <code>responsibleUuid</code> informado não está alocado neste projeto.</td></tr>
            <tr><td>422</td><td><code>RESPONSIBLE_CANNOT_BE_ASSIGNEE</code></td><td>O perfil do usuário informado não concede <code>DEMAND_BE_ASSIGNEE</code>.</td></tr>
            <tr><td>403</td><td><code>DEMAND_IN_PRODUCTION_IS_TERMINAL</code></td><td>A demanda já está em produção — congelada, como na interface.</td></tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-surface p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm text-body">
          Toda tentativa de autenticação de integração recusada é <strong>intencionalmente
          não registrada</strong> em Logs — a mesma política aplicada a um login de usuário
          recusado, para não transformar o próprio módulo de auditoria num alvo de
          varredura por tentativa e erro.
        </p>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted p-4">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
        <p className="text-sm text-body">
          O que a integração <strong>escreve</strong> com sucesso aparece normalmente em{' '}
          <Link to="/logs" className="font-semibold text-brand-800 underline underline-offset-2">
            Logs
          </Link>{' '}
          e na aba Atualizações da própria demanda — atribuído a "Integração", não a uma
          pessoa, para deixar claro como aquela mudança realmente aconteceu.
        </p>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted p-4">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
        <p className="text-sm text-body">
          Consulte a{' '}
          <Link
            to="/documentacao?doc=requisitos-adicionados#36-integração-criação-e-atualização-de-demandas-via-api"
            className="font-semibold text-brand-800 underline underline-offset-2"
          >
            documentação completa
          </Link>{' '}
          para o desenho de segurança por trás desta API.
        </p>
      </div>
    </>
  );
}
