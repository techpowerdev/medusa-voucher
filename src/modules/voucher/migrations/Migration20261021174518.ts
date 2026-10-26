import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261021174518 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "voucher_product" ("id" text not null, "face_value" numeric not null, "currency_code" text not null, "raw_face_value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "voucher_product_pkey" primary key ("id"), constraint voucher_product_face_value_positive_check check (face_value > 0));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_product_deleted_at" ON "voucher_product" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "voucher_product" cascade;`);
  }

}
