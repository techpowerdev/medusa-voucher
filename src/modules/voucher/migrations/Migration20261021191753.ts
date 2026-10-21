import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261021191753 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "voucher_allocation" drop constraint if exists "voucher_allocation_order_line_item_id_unit_index_unique";`);
    this.addSql(`alter table if exists "voucher_allocation" add column if not exists "unit_index" integer not null;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_voucher_allocation_order_line_item_id_unit_index_unique" ON "voucher_allocation" ("order_line_item_id", "unit_index") WHERE deleted_at IS NULL AND replaces_allocation_id IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_voucher_allocation_order_line_item_id_unit_index_unique";`);
    this.addSql(`alter table if exists "voucher_allocation" drop column if exists "unit_index";`);
  }

}
