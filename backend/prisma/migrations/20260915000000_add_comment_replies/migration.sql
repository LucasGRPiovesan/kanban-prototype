-- AlterTable
ALTER TABLE `demand_comments` ADD COLUMN `parent_comment_id` BIGINT UNSIGNED NULL;

-- CreateIndex
CREATE INDEX `ix_demand_comments_parent` ON `demand_comments`(`parent_comment_id`);

-- AddForeignKey
ALTER TABLE `demand_comments` ADD CONSTRAINT `demand_comments_parent_comment_id_fkey` FOREIGN KEY (`parent_comment_id`) REFERENCES `demand_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
