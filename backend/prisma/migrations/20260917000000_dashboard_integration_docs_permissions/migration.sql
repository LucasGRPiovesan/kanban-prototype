-- Dashboard, Integração and Documentação become modules with their own permissions.
--
-- Until now the three screens were open to everyone signed in (the Dashboard behind
-- DEMAND_ACCESS). Every existing role keeps reaching them: all roles receive the Dashboard
-- with personal indicators, the integration docs and the system docs. The team's
-- consolidated indicators (DASHBOARD_VIEW_ALL) are deliberately NOT backfilled: they are
-- granted on purpose, per role — the seed does it for Administrador and Agilista.
INSERT INTO `permissions` (`code`, `module`, `action`, `description`)
VALUES
  ('DASHBOARD_ACCESS', 'DASHBOARD', 'ACCESS', 'Acessar a Dashboard'),
  ('DASHBOARD_VIEW_OWN', 'DASHBOARD', 'VIEW_OWN', 'Visualizar indicadores pessoais (demandas sob sua responsabilidade)'),
  ('DASHBOARD_VIEW_ALL', 'DASHBOARD', 'VIEW_ALL', 'Visualizar indicadores consolidados da equipe (todas as demandas visíveis)'),
  ('INTEGRATION_ACCESS', 'INTEGRATION', 'ACCESS', 'Acessar a documentação da API de integração'),
  ('DOCS_ACCESS', 'DOCS', 'ACCESS', 'Acessar a documentação do sistema')
ON DUPLICATE KEY UPDATE `code` = `code`;

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`code` IN ('DASHBOARD_ACCESS', 'DASHBOARD_VIEW_OWN', 'INTEGRATION_ACCESS', 'DOCS_ACCESS');
