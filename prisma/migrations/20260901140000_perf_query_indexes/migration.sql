-- Additive indexes for hot filters. No business-schema redesign.

CREATE INDEX IF NOT EXISTS "EmployeeProfile_createdAt_idx" ON "employee_profiles"("created_at");

CREATE INDEX IF NOT EXISTS "EmployeeSkill_skillId_idx" ON "employee_skills"("skill_id");

CREATE INDEX IF NOT EXISTS "Job_cityId_status_idx" ON "jobs"("city_id", "status");

CREATE INDEX IF NOT EXISTS "SupportProvider_approvalStatus_idx" ON "support_providers"("approval_status");

CREATE INDEX IF NOT EXISTS "SupportProvider_categoryId_idx" ON "support_providers"("category_id");

CREATE INDEX IF NOT EXISTS "SupportProvider_deletedAt_idx" ON "support_providers"("deleted_at");

CREATE INDEX IF NOT EXISTS "GeoCoverage_providerId_idx" ON "geo_coverages"("provider_id");
