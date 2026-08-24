-- Catalog and welfare copy: locale map instead of one column per language.
-- Adding a language is a JSON key, not an ALTER TABLE.

ALTER TABLE "districts" ADD COLUMN "names" JSONB;
UPDATE "districts"
SET "names" = jsonb_build_object('en', "name_en", 'ta', "name_ta", 'hi', "name_hi");
ALTER TABLE "districts" ALTER COLUMN "names" SET NOT NULL;
ALTER TABLE "districts" DROP COLUMN "name_en", DROP COLUMN "name_ta", DROP COLUMN "name_hi";

ALTER TABLE "cities" ADD COLUMN "names" JSONB;
UPDATE "cities"
SET "names" = jsonb_build_object('en', "name_en", 'ta', "name_ta", 'hi', "name_hi");
ALTER TABLE "cities" ALTER COLUMN "names" SET NOT NULL;
ALTER TABLE "cities" DROP COLUMN "name_en", DROP COLUMN "name_ta", DROP COLUMN "name_hi";

ALTER TABLE "areas" ADD COLUMN "names" JSONB;
UPDATE "areas"
SET "names" = jsonb_build_object('en', "name_en", 'ta', "name_ta", 'hi', "name_hi");
ALTER TABLE "areas" ALTER COLUMN "names" SET NOT NULL;
ALTER TABLE "areas" DROP COLUMN "name_en", DROP COLUMN "name_ta", DROP COLUMN "name_hi";

ALTER TABLE "skill_categories" ADD COLUMN "names" JSONB;
UPDATE "skill_categories"
SET "names" = jsonb_build_object('en', "name_en", 'ta', "name_ta", 'hi', "name_hi");
ALTER TABLE "skill_categories" ALTER COLUMN "names" SET NOT NULL;
ALTER TABLE "skill_categories" DROP COLUMN "name_en", DROP COLUMN "name_ta", DROP COLUMN "name_hi";

ALTER TABLE "skills" ADD COLUMN "names" JSONB;
UPDATE "skills"
SET "names" = jsonb_build_object('en', "name_en", 'ta', "name_ta", 'hi', "name_hi");
ALTER TABLE "skills" ALTER COLUMN "names" SET NOT NULL;
ALTER TABLE "skills" DROP COLUMN "name_en", DROP COLUMN "name_ta", DROP COLUMN "name_hi";

ALTER TABLE "support_provider_categories" ADD COLUMN "names" JSONB;
UPDATE "support_provider_categories"
SET "names" = jsonb_build_object('en', "name_en", 'ta', "name_ta", 'hi', "name_hi");
ALTER TABLE "support_provider_categories" ALTER COLUMN "names" SET NOT NULL;
ALTER TABLE "support_provider_categories"
  DROP COLUMN "name_en", DROP COLUMN "name_ta", DROP COLUMN "name_hi";

ALTER TABLE "welfare_contents" ADD COLUMN "titles" JSONB;
ALTER TABLE "welfare_contents" ADD COLUMN "bodies" JSONB;
UPDATE "welfare_contents"
SET
  "titles" = jsonb_build_object('en', "title_en", 'ta', "title_ta", 'hi', "title_hi"),
  "bodies" = jsonb_strip_nulls(
    jsonb_build_object('en', "body_en", 'ta', "body_ta", 'hi', "body_hi")
  );
ALTER TABLE "welfare_contents" ALTER COLUMN "titles" SET NOT NULL;
ALTER TABLE "welfare_contents" ALTER COLUMN "bodies" SET NOT NULL;
ALTER TABLE "welfare_contents"
  DROP COLUMN "title_en",
  DROP COLUMN "title_ta",
  DROP COLUMN "title_hi",
  DROP COLUMN "body_en",
  DROP COLUMN "body_ta",
  DROP COLUMN "body_hi";
