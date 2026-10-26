import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Written by hand: the generated migration dropped "allocation_failure" and created
// "voucher_allocation_failure", losing every stored failure. Renaming keeps the rows; the
// constraint and index names follow so they match a table created fresh.
const RENAMES: [string, string][] = [
  ["allocation_failure_pkey", "voucher_allocation_failure_pkey"],
  ["allocation_failure_status_check", "voucher_allocation_failure_status_check"],
];

const INDEXES = ["deleted_at", "order_id", "status", "order_line_item_id_unique"];

export class Migration20261026120410 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "allocation_failure" rename to "voucher_allocation_failure";`);
    for (const [from, to] of RENAMES) {
      this.addSql(`alter table if exists "voucher_allocation_failure" rename constraint "${from}" to "${to}";`);
    }
    for (const index of INDEXES) {
      this.addSql(`alter index if exists "IDX_allocation_failure_${index}" rename to "IDX_voucher_allocation_failure_${index}";`);
    }
  }

  override async down(): Promise<void> {
    for (const index of INDEXES) {
      this.addSql(`alter index if exists "IDX_voucher_allocation_failure_${index}" rename to "IDX_allocation_failure_${index}";`);
    }
    for (const [from, to] of RENAMES) {
      this.addSql(`alter table if exists "voucher_allocation_failure" rename constraint "${to}" to "${from}";`);
    }
    this.addSql(`alter table if exists "voucher_allocation_failure" rename to "allocation_failure";`);
  }

}
