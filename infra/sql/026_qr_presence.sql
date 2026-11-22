BEGIN;

-- Migration 026 : Systeme d'emargement securise par QR Code dynamique tournant
-- Conception institutionnelle ENP : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu

CREATE TABLE IF NOT EXISTS academic.seance_presence_session (
  id                       SERIAL PRIMARY KEY,
  seance_id                INT NOT NULL REFERENCES academic.attendance_sessions(id) ON DELETE CASCADE,
  enseignant_id            INT NOT NULL REFERENCES identity.users(id),
  statut                   VARCHAR(20) NOT NULL DEFAULT 'ouverte'
                             CHECK (statut IN ('ouverte', 'pause', 'fermee')),
  session_secret           VARCHAR(64) NOT NULL,
  token_counter            INT NOT NULL DEFAULT 0 CHECK (token_counter >= 0),
  ouvert_a                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ferme_a                  TIMESTAMPTZ,
  duree_validite_secondes  INT NOT NULL DEFAULT 6 CHECK (duree_validite_secondes BETWEEN 3 AND 30),
  CONSTRAINT uq_seance_presence_session_seance UNIQUE (seance_id)
);

CREATE INDEX IF NOT EXISTS seance_presence_session_statut_idx
  ON academic.seance_presence_session (statut, ouvert_a DESC);

CREATE TABLE IF NOT EXISTS academic.presence_scan_log (
  id                 BIGSERIAL PRIMARY KEY,
  seance_id          INT NOT NULL REFERENCES academic.attendance_sessions(id) ON DELETE CASCADE,
  etudiant_id        INT NOT NULL REFERENCES identity.users(id),
  scanne_a           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_counter      INT NOT NULL,
  token_age_ms       INT NOT NULL,
  ip_address         VARCHAR(45),
  device_fingerprint VARCHAR(64) NOT NULL,
  statut             VARCHAR(24) NOT NULL DEFAULT 'valide'
                       CHECK (statut IN ('valide', 'rejete_expire', 'rejete_doublon', 'rejete_appareil')),
  CONSTRAINT uq_presence_scan_seance_etudiant UNIQUE (seance_id, etudiant_id)
);

CREATE INDEX IF NOT EXISTS presence_scan_log_device_idx
  ON academic.presence_scan_log (seance_id, device_fingerprint)
  WHERE statut = 'valide';

CREATE INDEX IF NOT EXISTS presence_scan_log_recent_idx
  ON academic.presence_scan_log (seance_id, scanne_a DESC);

GRANT SELECT, INSERT, UPDATE ON academic.seance_presence_session TO app_main;
GRANT USAGE, SELECT ON SEQUENCE academic.seance_presence_session_id_seq TO app_main;
GRANT SELECT, INSERT ON academic.presence_scan_log TO app_main;
GRANT USAGE, SELECT ON SEQUENCE academic.presence_scan_log_id_seq TO app_main;

COMMIT;
