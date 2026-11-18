BEGIN;

ALTER TABLE ref.ue
  ADD COLUMN IF NOT EXISTS composite_parent_id INT
    REFERENCES ref.ue(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ue_not_own_composite_parent'
      AND conrelid = 'ref.ue'::regclass
  ) THEN
    ALTER TABLE ref.ue
      ADD CONSTRAINT ue_not_own_composite_parent
      CHECK (composite_parent_id IS NULL OR composite_parent_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ue_composite_parent_idx
  ON ref.ue (composite_parent_id)
  WHERE composite_parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ref.refuser_offre_ue_composite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ref.ue enfant
    WHERE enfant.composite_parent_id = NEW.ue_id
  ) THEN
    RAISE EXCEPTION 'Une UE composite ne peut pas avoir une offre de cours distincte'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_refuser_ue_composite ON ref.course;
CREATE TRIGGER course_refuser_ue_composite
  BEFORE INSERT OR UPDATE OF ue_id ON ref.course
  FOR EACH ROW
  EXECUTE FUNCTION ref.refuser_offre_ue_composite();

COMMIT;
