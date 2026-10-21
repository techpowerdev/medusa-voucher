import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261021030409 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "voucher" drop constraint if exists "voucher_code_unique";`);
    this.addSql(`create table if not exists "voucher" ("id" text not null, "code" text not null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "voucher_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_voucher_code_unique" ON "voucher" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_deleted_at" ON "voucher" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "voucher" cascade;`);
  }

}
