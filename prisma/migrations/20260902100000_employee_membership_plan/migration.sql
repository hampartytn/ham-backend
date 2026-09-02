-- Employee HAM Membership plan + optional org on payments (employee has no organization).

CREATE TABLE "membership_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "names" JSONB NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_plans_code_key" ON "membership_plans"("code");

ALTER TABLE "payments" ALTER COLUMN "organization_id" DROP NOT NULL;

ALTER TABLE "payments" ADD COLUMN "membership_id" UUID;
ALTER TABLE "payments" ADD COLUMN "membership_plan_id" UUID;
ALTER TABLE "payments" ADD COLUMN "provider_payment_id" TEXT;

ALTER TABLE "payments" ADD CONSTRAINT "payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "ham_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_membership_plan_id_fkey" FOREIGN KEY ("membership_plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Payment_userId_purpose_status_idx" ON "payments"("user_id", "purpose", "status");
