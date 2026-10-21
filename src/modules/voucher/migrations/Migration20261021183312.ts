import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261021183312 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "voucher_batch" drop column if exists "partner", drop column if exists "face_value", drop column if exists "currency_code", drop column if exists "raw_face_value";`);

    this.addSql(`alter table if exists "voucher_batch" add column if not exists "voucher_product_id" text not null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_batch_voucher_product_id" ON "voucher_batch" ("voucher_product_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_voucher_batch_voucher_product_id";`);

    this.addSql(`alter table if exists "voucher_batch" add column if not exists "face_value" numeric not null, add column if not exists "currency_code" text not null, add column if not exists "raw_face_value" jsonb not null;`);
    this.addSql(`alter table if exists "voucher_batch" rename column "voucher_product_id" to "partner";`);
  }

}
