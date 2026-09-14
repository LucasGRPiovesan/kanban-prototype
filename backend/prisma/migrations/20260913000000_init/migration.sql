-- CreateTable
CREATE TABLE `roles` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_roles_uuid`(`uuid`),
    UNIQUE INDEX `uq_roles_slug`(`slug`),
    INDEX `ix_roles_active_name`(`active`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(60) NOT NULL,
    `module` VARCHAR(40) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `description` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `uq_permissions_code`(`code`),
    INDEX `ix_permissions_module_action`(`module`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` BIGINT UNSIGNED NOT NULL,
    `permission_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_role_permissions_permission_role`(`permission_id`, `role_id`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `avatar_url` VARCHAR(500) NULL,
    `role_id` BIGINT UNSIGNED NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_users_uuid`(`uuid`),
    INDEX `ix_users_role_active_name`(`role_id`, `active`, `name`),
    INDEX `ix_users_active_name`(`active`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_by_user_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_projects_uuid`(`uuid`),
    INDEX `ix_projects_active_name`(`active`, `name`),
    INDEX `ix_projects_created_by`(`created_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_members` (
    `project_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_project_members_user_project`(`user_id`, `project_id`),
    PRIMARY KEY (`project_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demands` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `project_id` BIGINT UNSIGNED NULL,
    `title` VARCHAR(180) NOT NULL,
    `description` TEXT NOT NULL,
    `due_date` DATE NOT NULL,
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'IN_REVIEW', 'PRODUCTION') NOT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `responsible_user_id` BIGINT UNSIGNED NOT NULL,
    `created_by_user_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_demands_uuid`(`uuid`),
    INDEX `ix_demands_project_status_due`(`project_id`, `status`, `due_date`),
    INDEX `ix_demands_project_archived_due`(`project_id`, `archived`, `due_date`),
    INDEX `ix_demands_responsible`(`responsible_user_id`),
    INDEX `ix_demands_created_by`(`created_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demand_checklist_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `demand_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(240) NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `position` SMALLINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_demand_checklist_items_uuid`(`uuid`),
    INDEX `ix_demand_checklist_demand_position`(`demand_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demand_attachments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `demand_id` BIGINT UNSIGNED NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(120) NOT NULL,
    `size_bytes` INTEGER UNSIGNED NOT NULL,
    `storage_key` VARCHAR(400) NOT NULL,
    `thumbnail_key` VARCHAR(400) NULL,
    `created_by_user_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_demand_attachments_uuid`(`uuid`),
    INDEX `ix_demand_attachments_demand_created`(`demand_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demand_comments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `demand_id` BIGINT UNSIGNED NOT NULL,
    `author_user_id` BIGINT UNSIGNED NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `edited_at` DATETIME(3) NULL,

    UNIQUE INDEX `uq_demand_comments_uuid`(`uuid`),
    INDEX `ix_demand_comments_demand_created`(`demand_id`, `created_at`),
    INDEX `ix_demand_comments_author`(`author_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demand_watchers` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `demand_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_demand_watchers_demand_user`(`demand_id`, `user_id`),
    PRIMARY KEY (`user_id`, `demand_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `recipient_user_id` BIGINT UNSIGNED NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `demand_uuid` CHAR(36) NOT NULL,
    `demand_title` VARCHAR(200) NOT NULL,
    `project_name` VARCHAR(160) NULL,
    `actor_uuid` CHAR(36) NULL,
    `actor_name` VARCHAR(160) NULL,
    `changes` JSON NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_notifications_uuid`(`uuid`),
    INDEX `ix_notifications_recipient_created`(`recipient_user_id`, `created_at`),
    INDEX `ix_notifications_recipient_read`(`recipient_user_id`, `read_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_integration_credentials` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `project_id` BIGINT UNSIGNED NOT NULL,
    `api_key` VARCHAR(64) NOT NULL,
    `secret_hash` VARCHAR(255) NOT NULL,
    `secret_preview` VARCHAR(8) NOT NULL,
    `created_by_user_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rotated_at` DATETIME(3) NULL,

    UNIQUE INDEX `uq_project_integration_uuid`(`uuid`),
    UNIQUE INDEX `uq_project_integration_project`(`project_id`),
    UNIQUE INDEX `uq_project_integration_api_key`(`api_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `category` ENUM('ACTIVITY', 'SYSTEM') NOT NULL,
    `level` ENUM('INFO', 'WARNING', 'ERROR') NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `actor_uuid` CHAR(36) NULL,
    `actor_name` VARCHAR(160) NULL,
    `subject_type` ENUM('DEMAND', 'PROJECT', 'USER', 'ROLE', 'SETTING') NULL,
    `subject_uuid` CHAR(36) NULL,
    `subject_label` VARCHAR(200) NULL,
    `project_uuid` CHAR(36) NULL,
    `project_name` VARCHAR(160) NULL,
    `changes` JSON NULL,
    `metadata` JSON NULL,
    `request_id` VARCHAR(128) NULL,

    UNIQUE INDEX `uq_logs_uuid`(`uuid`),
    INDEX `ix_logs_subject_time`(`subject_type`, `subject_uuid`, `occurred_at`, `uuid`),
    INDEX `ix_logs_category_time`(`category`, `occurred_at`, `uuid`),
    INDEX `ix_logs_project_time`(`project_uuid`, `occurred_at`, `uuid`),
    INDEX `ix_logs_actor_time`(`actor_uuid`, `occurred_at`, `uuid`),
    INDEX `ix_logs_request`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assistant_settings` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `scope` VARCHAR(20) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `provider` VARCHAR(30) NOT NULL,
    `model` VARCHAR(80) NOT NULL,
    `api_key_ciphertext` VARCHAR(1024) NULL,
    `api_key_preview` VARCHAR(8) NULL,
    `updated_by_user_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_assistant_settings_uuid`(`uuid`),
    UNIQUE INDEX `uq_assistant_settings_scope`(`scope`),
    INDEX `ix_assistant_settings_updated_by`(`updated_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demands` ADD CONSTRAINT `demands_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demands` ADD CONSTRAINT `demands_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demands` ADD CONSTRAINT `demands_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_checklist_items` ADD CONSTRAINT `demand_checklist_items_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_attachments` ADD CONSTRAINT `demand_attachments_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_attachments` ADD CONSTRAINT `demand_attachments_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_comments` ADD CONSTRAINT `demand_comments_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_comments` ADD CONSTRAINT `demand_comments_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_watchers` ADD CONSTRAINT `demand_watchers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_watchers` ADD CONSTRAINT `demand_watchers_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_integration_credentials` ADD CONSTRAINT `project_integration_credentials_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_integration_credentials` ADD CONSTRAINT `project_integration_credentials_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assistant_settings` ADD CONSTRAINT `assistant_settings_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

