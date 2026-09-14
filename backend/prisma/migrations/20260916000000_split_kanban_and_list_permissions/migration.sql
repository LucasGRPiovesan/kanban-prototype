-- DEMAND_ACCESS used to open both the Kanban and the Demandas screen. They are now two
-- children of it (DEMAND_KANBAN, DEMAND_LIST). Every role that could reach both screens
-- before keeps reaching both: the permission rows are created here (the seed then keeps
-- their descriptions in sync) and granted to every role that holds DEMAND_ACCESS —
-- custom roles included, which the seed never touches.
INSERT INTO `permissions` (`code`, `module`, `action`, `description`)
VALUES
  ('DEMAND_KANBAN', 'DEMAND', 'KANBAN', 'Acessar o quadro Kanban'),
  ('DEMAND_LIST', 'DEMAND', 'LIST', 'Acessar a tela Demandas (histórico e listagem completa)')
ON DUPLICATE KEY UPDATE `code` = `code`;

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT rp.`role_id`, p.`id`
FROM `role_permissions` rp
JOIN `permissions` access ON access.`id` = rp.`permission_id` AND access.`code` = 'DEMAND_ACCESS'
JOIN `permissions` p ON p.`code` IN ('DEMAND_KANBAN', 'DEMAND_LIST');
