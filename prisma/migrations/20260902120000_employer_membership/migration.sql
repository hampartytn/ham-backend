-- Employer HAM Membership is org-scoped and independent of
-- Organization.verification_state and Organization.activation_status.

CREATE TYPE "EmployerMembershipStatus" AS ENUM ('INACTIVE', 'ACTIVE');

ALTER TABLE "organizations"
ADD COLUMN "membership_status" "EmployerMembershipStatus" NOT NULL DEFAULT 'INACTIVE';

ALTER TABLE "organizations"
ADD COLUMN "membership_activated_at" TIMESTAMPTZ(6);
