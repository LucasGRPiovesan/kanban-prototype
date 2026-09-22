-- CreateTable
CREATE TABLE `branding_settings` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `scope` VARCHAR(20) NOT NULL,
    `logo_light_storage_key` VARCHAR(255) NULL,
    `logo_dark_storage_key` VARCHAR(255) NULL,
    `updated_by_user_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_branding_settings_uuid`(`uuid`),
    UNIQUE INDEX `uq_branding_settings_scope`(`scope`),
    INDEX `ix_branding_settings_updated_by`(`updated_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `branding_settings` ADD CONSTRAINT `branding_settings_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
