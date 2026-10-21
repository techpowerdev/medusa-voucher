import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261021050940 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "voucher_allocation" drop constraint if exists "voucher_allocation_voucher_id_unique";`);
    this.addSql(`alter table if exists "voucher" drop constraint if exists "voucher_code_hash_unique";`);
    this.addSql(`create table if not exists "allocation_failure" ("id" text not null, "order_id" text not null, "order_line_item_id" text not null, "variant_id" text not null, "quantity_requested" integer not null, "quantity_available" integer not null, "status" text check ("status" in ('open', 'resolved')) not null default 'open', "resolved_at" timestamptz null, "resolution_note" text null, "resolved_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "allocation_failure_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_allocation_failure_deleted_at" ON "allocation_failure" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_allocation_failure_order_id" ON "allocation_failure" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_allocation_failure_status" ON "allocation_failure" ("status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "voucher_batch" ("id" text not null, "partner" text not null, "variant_id" text not null, "face_value" numeric not null, "currency_code" text not null, "unit_cost" numeric null, "purchased_at" timestamptz not null, "reference" text null, "redemption_instructions" text null, "imported_by" text null, "metadata" jsonb null, "raw_face_value" jsonb not null, "raw_unit_cost" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "voucher_batch_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_batch_variant_id" ON "voucher_batch" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_batch_deleted_at" ON "voucher_batch" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "voucher" ("id" text not null, "code_encrypted" text not null, "code_hash" text not null, "code_hint" text not null, "pin_encrypted" text null, "status" text check ("status" in ('available', 'allocated', 'delivered', 'expired', 'void')) not null default 'available', "valid_from" timestamptz null, "valid_until" timestamptz null, "void_reason" text null, "voided_at" timestamptz null, "voided_by" text null, "variant_id" text not null, "batch_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "voucher_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_voucher_code_hash_unique" ON "voucher" ("code_hash") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_batch_id" ON "voucher" ("batch_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_deleted_at" ON "voucher" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_variant_id_status_valid_until" ON "voucher" ("variant_id", "status", "valid_until") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "voucher_allocation" ("id" text not null, "order_id" text not null, "order_line_item_id" text not null, "customer_id" text null, "recipient_email" text null, "delivery_channel" text not null default 'email', "delivery_status" text check ("delivery_status" in ('pending', 'delivered', 'failed')) not null default 'pending', "delivery_attempts" integer not null default 0, "delivery_error" text null, "delivered_at" timestamptz null, "replaces_allocation_id" text null, "replacement_reason" text null, "replaced_by" text null, "voucher_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "voucher_allocation_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_voucher_allocation_voucher_id_unique" ON "voucher_allocation" ("voucher_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_allocation_deleted_at" ON "voucher_allocation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_allocation_order_id" ON "voucher_allocation" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_allocation_order_line_item_id" ON "voucher_allocation" ("order_line_item_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "voucher" add constraint "voucher_batch_id_foreign" foreign key ("batch_id") references "voucher_batch" ("id") on update cascade;`);

    this.addSql(`alter table if exists "voucher_allocation" add constraint "voucher_allocation_voucher_id_foreign" foreign key ("voucher_id") references "voucher" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "voucher" drop constraint if exists "voucher_batch_id_foreign";`);

    this.addSql(`alter table if exists "voucher_allocation" drop constraint if exists "voucher_allocation_voucher_id_foreign";`);

    this.addSql(`drop table if exists "allocation_failure" cascade;`);

    this.addSql(`drop table if exists "voucher_batch" cascade;`);

    this.addSql(`drop table if exists "voucher" cascade;`);

    this.addSql(`drop table if exists "voucher_allocation" cascade;`);
  }

}
