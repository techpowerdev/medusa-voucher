import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261022025104 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "allocation_failure" drop constraint if exists "allocation_failure_order_line_item_id_unique";`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_allocation_failure_order_line_item_id_unique" ON "allocation_failure" ("order_line_item_id") WHERE deleted_at IS NULL AND status = 'open';`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_allocation_failure_order_line_item_id_unique";`);
  }

}
