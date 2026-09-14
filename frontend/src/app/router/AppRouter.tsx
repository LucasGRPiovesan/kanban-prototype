import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/app/layouts/AppLayout';
import { KanbanRouteGuard, ModuleAccessGuard, ProtectedRoute } from '@/app/router/guards';
import { FullPageLoader } from '@/components/ui/FullPageLoader';
import { LoginPage } from '@/features/auth/LoginPage';

/**
 * Every screen behind the login is its own chunk, loaded on first visit.
 *
 * The login page stays in the entry bundle — it is the first thing anyone sees — while
 * the rest (the board with drag-and-drop, the rich-text editor, charts, documentation
 * with its diagram library) is fetched only when navigated to. One Suspense boundary in
 * the shell covers them all; the documentation keeps its own, more specific message.
 */
function page<K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}

const HomePage = page(() => import('@/features/home/HomePage'), 'HomePage');
const KanbanPage = page(() => import('@/features/kanban/KanbanPage'), 'KanbanPage');
const DashboardPage = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const DemandFormPage = page(() => import('@/features/demands/DemandFormPage'), 'DemandFormPage');
const DemandsListPage = page(() => import('@/features/demands/DemandsListPage'), 'DemandsListPage');
const ProjectsPage = page(() => import('@/features/projects/ProjectsPage'), 'ProjectsPage');
const RolesPage = page(() => import('@/features/roles/RolesPage'), 'RolesPage');
const RoleFormPage = page(() => import('@/features/roles/RoleFormPage'), 'RoleFormPage');
const RolePermissionsPage = page(() => import('@/features/roles/RolePermissionsPage'), 'RolePermissionsPage');
const UserFormPage = page(() => import('@/features/users/UserFormPage'), 'UserFormPage');
const UserProfilePage = page(() => import('@/features/users/UserProfilePage'), 'UserProfilePage');
const UsersPage = page(() => import('@/features/users/UsersPage'), 'UsersPage');
const NotFoundPage = page(() => import('@/features/home/NotFoundPage'), 'NotFoundPage');
const ProfilePage = page(() => import('@/features/profile/ProfilePage'), 'ProfilePage');
const LogsPage = page(() => import('@/features/logs/LogsPage'), 'LogsPage');
const IntegrationDocsPage = page(() => import('@/features/integration/IntegrationDocsPage'), 'IntegrationDocsPage');

// Lazy: this is the one screen that pulls in the diagram-rendering library, and
// nobody visiting the Kanban or a demand should pay for that bundle upfront.
const DocsPage = lazy(() => import('@/features/docs/DocsPage').then((m) => ({ default: m.DocsPage })));

/**
 * Routes carry the same permission requirements as the menu, so a URL typed by hand is
 * no more permissive than a link. The backend enforces the same rules again on every
 * request — these guards only keep the UI coherent.
 */
export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />

        {/*
          No permission guard: it is every signed-in person's own account, reached by
          clicking their own name in the Topbar.
        */}
        <Route path="/perfil" element={<ProfilePage />} />

        <Route
          path="/dashboard"
          element={
            <ModuleAccessGuard
              permissions={['DEMAND_ACCESS', 'DASHBOARD_ACCESS']}
              anyOf={['DASHBOARD_VIEW_OWN', 'DASHBOARD_VIEW_ALL']}
            >
              <DashboardPage />
            </ModuleAccessGuard>
          }
        />

        <Route
          path="/kanban"
          element={
            <KanbanRouteGuard>
              <KanbanPage />
            </KanbanRouteGuard>
          }
        />

        <Route
          path="/demandas"
          element={
            <ModuleAccessGuard permissions={['DEMAND_ACCESS', 'DEMAND_LIST']}>
              <DemandsListPage />
            </ModuleAccessGuard>
          }
        />
        <Route
          path="/demandas/nova"
          element={
            <ModuleAccessGuard permissions={['DEMAND_ACCESS', 'DEMAND_CREATE']}>
              <DemandFormPage />
            </ModuleAccessGuard>
          }
        />
        <Route
          path="/demandas/:uuid/editar"
          element={
            <ModuleAccessGuard permissions={['DEMAND_ACCESS', 'DEMAND_UPDATE']}>
              <DemandFormPage />
            </ModuleAccessGuard>
          }
        />

        <Route
          path="/projetos"
          element={
            <ModuleAccessGuard permissions={['PROJECT_ACCESS']}>
              <ProjectsPage />
            </ModuleAccessGuard>
          }
        />

        <Route
          path="/usuarios"
          element={
            <ModuleAccessGuard permissions={['USER_ACCESS']}>
              <UsersPage />
            </ModuleAccessGuard>
          }
        />
        <Route
          path="/usuarios/novo"
          element={
            <ModuleAccessGuard permissions={['USER_CREATE']}>
              <UserFormPage />
            </ModuleAccessGuard>
          }
        />
        <Route
          path="/usuarios/:uuid"
          element={
            <ModuleAccessGuard permissions={['USER_ACCESS']}>
              <UserProfilePage />
            </ModuleAccessGuard>
          }
        />

        <Route
          path="/perfis"
          element={
            <ModuleAccessGuard permissions={['ROLE_ACCESS']}>
              <RolesPage />
            </ModuleAccessGuard>
          }
        />
        <Route
          path="/perfis/novo"
          element={
            <ModuleAccessGuard permissions={['ROLE_ACCESS', 'ROLE_CREATE']}>
              <RoleFormPage />
            </ModuleAccessGuard>
          }
        />
        <Route
          path="/perfis/:uuid/permissoes"
          element={
            <ModuleAccessGuard permissions={['ROLE_ACCESS', 'ROLE_UPDATE']}>
              <RolePermissionsPage />
            </ModuleAccessGuard>
          }
        />

        <Route
          path="/logs"
          element={
            <ModuleAccessGuard permissions={['LOG_ACCESS']}>
              <LogsPage />
            </ModuleAccessGuard>
          }
        />

        {/*
          Both are static documentation bundled with the app, gated by their own module
          permission. Generating a project's integration credentials is a separate
          action, gated on the Projects screen by PROJECT_MANAGE_INTEGRATION.
        */}
        <Route
          path="/integracao"
          element={
            <ModuleAccessGuard permissions={['INTEGRATION_ACCESS']}>
              <IntegrationDocsPage />
            </ModuleAccessGuard>
          }
        />
        <Route
          path="/documentacao"
          element={
            <ModuleAccessGuard permissions={['DOCS_ACCESS']}>
              <Suspense fallback={<FullPageLoader label="Carregando documentação" />}>
                <DocsPage />
              </Suspense>
            </ModuleAccessGuard>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
