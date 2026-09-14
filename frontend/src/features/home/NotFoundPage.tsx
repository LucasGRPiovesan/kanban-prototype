import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { PageShell } from '@/components/ui/PageHeader';

export function NotFoundPage() {
  return (
    <PageShell>
      <div className="card-surface">
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Página não encontrada"
          description="O endereço acessado não existe ou não está disponível para o seu perfil."
          action={
            <Link to="/" className={buttonClasses('primary', 'md')}>
              Voltar para o início
            </Link>
          }
        />
      </div>
    </PageShell>
  );
}
