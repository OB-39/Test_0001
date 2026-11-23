BEGIN;

-- 1. Extension forensique du journal d'audit institutionnel (ENP Lome)
ALTER TABLE audit.journal
  ADD COLUMN IF NOT EXISTS user_nom_complet TEXT,
  ADD COLUMN IF NOT EXISTS user_role VARCHAR(40),
  ADD COLUMN IF NOT EXISTS categorie VARCHAR(32) NOT NULL DEFAULT 'academique',
  ADD COLUMN IF NOT EXISTS gravite VARCHAR(16) NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS methode_http VARCHAR(10),
  ADD COLUMN IF NOT EXISTS chemin_http TEXT,
  ADD COLUMN IF NOT EXISTS statut_http SMALLINT,
  ADD COLUMN IF NOT EXISTS duree_ms INT,
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
  ADD COLUMN IF NOT EXISTS ip_forwarded_chain TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS os_nom VARCHAR(64),
  ADD COLUMN IF NOT EXISTS navigateur_nom VARCHAR(64),
  ADD COLUMN IF NOT EXISTS appareil_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(80),
  ADD COLUMN IF NOT EXISTS ecran_resolution VARCHAR(32),
  ADD COLUMN IF NOT EXISTS fuseau_horaire VARCHAR(64),
  ADD COLUMN IF NOT EXISTS langue VARCHAR(32),
  ADD COLUMN IF NOT EXISTS geo_source VARCHAR(32),
  ADD COLUMN IF NOT EXISTS geo_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_precision_m INT,
  ADD COLUMN IF NOT EXISTS geo_ville VARCHAR(120),
  ADD COLUMN IF NOT EXISTS geo_region VARCHAR(120),
  ADD COLUMN IF NOT EXISTS geo_pays VARCHAR(80),
  ADD COLUMN IF NOT EXISTS geo_fai VARCHAR(120),
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS metadata_json JSONB,
  ADD COLUMN IF NOT EXISTS previous_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS entry_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS hmac_signature CHAR(64);

-- 2. Indexation optimisee pour enquete rapide par utilisateur, IP, role et date
CREATE INDEX IF NOT EXISTS idx_audit_journal_user_date
  ON audit.journal (user_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_audit_journal_matricule_date
  ON audit.journal (user_matricule, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_audit_journal_role_date
  ON audit.journal (user_role, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_audit_journal_ip
  ON audit.journal (ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_journal_gravite_date
  ON audit.journal (gravite, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_audit_journal_fingerprint
  ON audit.journal (device_fingerprint);

-- 3. Protection WORM (Write-Once Read-Many) : aucune modification ni suppression possible
CREATE OR REPLACE FUNCTION audit.bloquer_modification_journal()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Journal d audit ENP inviolable : toute modification ou suppression est strictement interdite.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_journal_worm ON audit.journal;
CREATE TRIGGER trg_audit_journal_worm
  BEFORE UPDATE OR DELETE ON audit.journal
  FOR EACH ROW
  EXECUTE FUNCTION audit.bloquer_modification_journal();

-- 4. Moindre privilege applicatif : lecture et insertion uniquement
REVOKE UPDATE, DELETE, TRUNCATE ON audit.journal FROM app_main;
GRANT SELECT, INSERT ON audit.journal TO app_main;

COMMIT;
