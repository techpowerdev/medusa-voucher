import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261022192006 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "voucher_delivery" drop constraint if exists "voucher_delivery_order_id_channel_unique";`);
    this.addSql(`create table if not exists "voucher_delivery" ("id" text not null, "order_id" text not null, "channel" text check ("channel" in ('email')) not null, "recipient" text null, "status" text check ("status" in ('pending', 'sending', 'delivered', 'failed')) not null default 'pending', "attempts" integer not null default 0, "last_error" text null, "delivered_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "voucher_delivery_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_delivery_deleted_at" ON "voucher_delivery" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_delivery_status" ON "voucher_delivery" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_voucher_delivery_order_id_channel_unique" ON "voucher_delivery" ("order_id", "channel") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "voucher_allocation" drop column if exists "delivery_channel", drop column if exists "delivery_status", drop column if exists "delivery_attempts", drop column if exists "delivery_error", drop column if exists "delivered_at";`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "voucher_delivery" cascade;`);

    this.addSql(`alter table if exists "voucher_allocation" add column if not exists "delivery_channel" text not null default 'email', add column if not exists "delivery_status" text check ("delivery_status" in ('pending', 'delivered', 'failed')) not null default 'pending', add column if not exists "delivery_attempts" integer not null default 0, add column if not exists "delivery_error" text null, add column if not exists "delivered_at" timestamptz null;`);
  }

}
