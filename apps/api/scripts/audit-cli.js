#!/usr/bin/env node
/**
 * Outil terminal d'investigation et d'export forensique ENP (lecture seule).
 * A executer dans le conteneur API Azure :
 *   node scripts/audit-cli.js --help
 */
const fs = require('node:fs');
const { createHmac } = require('node:crypto');

function parseArgs(argv) {
  const opts = {
    help: false,
    verify: false,
    limit: 50,
    user: null,
    role: null,
    ip: null,
    gravite: null,
    categorie: null,
    from: null,
    to: null,
    search: null,
    exportFmt: null,
    out: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--verify') opts.verify = true;
    else if (arg === '--last' || arg === '--limit') opts.limit = Math.min(5000, Math.max(1, Number(next()) || 50));
    else if (arg === '--user') opts.user = next() || null;
    else if (arg === '--role') opts.role = next() || null;
    else if (arg === '--ip') opts.ip = next() || null;
    else if (arg === '--gravite') opts.gravite = next() || null;
    else if (arg === '--categorie') opts.categorie = next() || null;
    else if (arg === '--from') opts.from = next() || null;
    else if (arg === '--to') opts.to = next() || null;
    else if (arg === '--search') opts.search = next() || null;
    else if (arg === '--export') opts.exportFmt = (next() || '').toLowerCase();
    else if (arg === '--out') opts.out = next() || null;
  }
  return opts;
}

function printHelp() {
  console.log(`
=== ENP Audit Forensique CLI (Lecture seule) ===

Exemples rapides :
  node scripts/audit-cli.js --last 30
  node scripts/audit-cli.js --user bienvenuohounsoun@gmail.com --last 100
  node scripts/audit-cli.js --role directeur_general --from 2026-11-01 --to 2026-11-30
  node scripts/audit-cli.js --ip 41.207.1.1 --last 50
  node scripts/audit-cli.js --gravite alerte --last 50
  node scripts/audit-cli.js --verify

Export complet d'une periode (CSV ou JSON) :
  node scripts/audit-cli.js --from 2026-11-01 --to 2026-11-30 --export csv --out /tmp/audit_nov.csv
  node scripts/audit-cli.js --from 2026-11-01 --to 2026-11-30 --export json --out /tmp/audit_nov.json
  node scripts/audit-cli.js --from 2026-11-01 --to 2026-11-30 --export csv

Options :
  --last <N>          Nombre d'entrees max (defaut: 50, max: 5000)
  --user <texte>      Filtre sur email, matricule ou nom complet
  --role <role>       Filtre sur role (admin, directeur_general, enseignant, etudiant...)
  --ip <ip>           Filtre sur adresse IP (exacte ou partielle)
  --gravite <niveau>  info | sensible | alerte | critique
  --categorie <cat>   authentification | securite | presence | direction | administration | academique | export | navigation
  --from <YYYY-MM-DD> Date de debut incluse
  --to <YYYY-MM-DD>   Date de fin incluse
  --search <texte>    Recherche libre (action, chemin, detail, empreinte, ville)
  --export <csv|json> Exporte toutes les colonnes forensiques
  --out <fichier>     Enregistre l'export dans un fichier (sinon affiche sur stdout)
  --verify            Verifie l'integrite cryptographique de la chaine (SHA-256 + HMAC)
`);
}

function escapeCsvCell(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[;"\r\n,]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function toCsv(rows) {
  const cols = [
    'id',
    'cree_le',
    'user_id',
    'user_matricule',
    'user_email',
    'user_nom_complet',
    'user_role',
    'categorie',
    'gravite',
    'action',
    'methode_http',
    'chemin_http',
    'statut_http',
    'duree_ms',
    'ip_address',
    'ip_forwarded_chain',
    'os_nom',
    'navigateur_nom',
    'appareil_type',
    'device_fingerprint',
    'ecran_resolution',
    'fuseau_horaire',
    'langue',
    'geo_source',
    'geo_latitude',
    'geo_longitude',
    'geo_precision_m',
    'geo_ville',
    'geo_region',
    'geo_pays',
    'geo_fai',
    'objet',
    'detail',
    'previous_hash',
    'entry_hash',
    'hmac_signature',
  ];
  const lines = [cols.join(';')];
  for (const row of rows) {
    lines.push(cols.map((k) => escapeCsvCell(row[k])).join(';'));
  }
  return '\uFEFF' + lines.join('\n') + '\n';
}

function hmacKey() {
  return (
    process.env.AUDIT_HMAC_SECRET?.trim() ||
    process.env.JWT_ACCESS_SECRET?.trim() ||
    'enp-lome-forensic-dev-hmac-secret-2026'
  );
}

async function runVerify(client) {
  const res = await client.query(
    `SELECT id, previous_hash, entry_hash, hmac_signature
     FROM audit.journal
     WHERE entry_hash IS NOT NULL
     ORDER BY id ASC`,
  );
  const rows = res.rows;
  const key = hmacKey();
  const anomalies = [];
  let prevHash = '0'.repeat(64);

  for (const row of rows) {
    if (row.previous_hash && row.previous_hash !== prevHash && anomalies.length < 20) {
      anomalies.push({ id: row.id, raison: 'Rupture chainage previous_hash' });
    }
    if (row.hmac_signature) {
      const expected = createHmac('sha256', key).update(row.entry_hash).digest('hex');
      if (row.hmac_signature !== expected && anomalies.length < 20) {
        anomalies.push({ id: row.id, raison: 'Signature HMAC invalide' });
      }
    }
    prevHash = row.entry_hash;
  }

  console.log(
    JSON.stringify(
      {
        statut: anomalies.length === 0 ? 'INTACT' : 'ANOMALIE_DETECTEE',
        entrees_scellees: rows.length,
        anomalies_count: anomalies.length,
        anomalies,
        verifie_le: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error('ERREUR: DATABASE_URL est absente de l environnement.');
    process.exit(1);
  }

  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    console.error('ERREUR: module pg introuvable. Executez cette commande depuis le conteneur API (/app/apps/api).');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (opts.verify) {
      await runVerify(client);
      return;
    }

    const clauses = [];
    const params = [];
    const addParam = (val) => {
      params.push(val);
      return `$${params.length}`;
    };

    if (opts.user) {
      const p = addParam(`%${opts.user.trim()}%`);
      clauses.push(
        `(COALESCE(u.email, '') ILIKE ${p} OR COALESCE(j.user_matricule, u.matricule, '') ILIKE ${p} OR COALESCE(j.user_nom_complet, '') ILIKE ${p})`,
      );
    }
    if (opts.role) {
      clauses.push(`j.user_role = ${addParam(opts.role.trim())}`);
    }
    if (opts.ip) {
      clauses.push(`COALESCE(j.ip_address, '') ILIKE ${addParam(`%${opts.ip.trim()}%`)}`);
    }
    if (opts.gravite) {
      clauses.push(`j.gravite = ${addParam(opts.gravite.trim())}`);
    }
    if (opts.categorie) {
      clauses.push(`j.categorie = ${addParam(opts.categorie.trim())}`);
    }
    if (opts.from) {
      clauses.push(`j.cree_le >= ${addParam(opts.from.trim())}::timestamptz`);
    }
    if (opts.to) {
      clauses.push(
        `j.cree_le < (${addParam(opts.to.trim())}::date + INTERVAL '1 day')`,
      );
    }
    if (opts.search) {
      const p = addParam(`%${opts.search.trim()}%`);
      clauses.push(
        `(j.action ILIKE ${p} OR COALESCE(j.chemin_http, '') ILIKE ${p} OR COALESCE(j.detail, '') ILIKE ${p} OR COALESCE(j.device_fingerprint, '') ILIKE ${p} OR COALESCE(j.geo_ville, '') ILIKE ${p})`,
      );
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitParam = addParam(opts.exportFmt ? Math.max(opts.limit, 5000) : opts.limit);

    const res = await client.query(
      `SELECT
         j.id,
         to_char(j.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le,
         j.user_id,
         COALESCE(j.user_matricule, u.matricule) AS user_matricule,
         u.email AS user_email,
         j.user_nom_complet,
         j.user_role,
         j.categorie,
         j.gravite,
         j.action,
         j.methode_http,
         j.chemin_http,
         j.statut_http,
         j.duree_ms,
         j.ip_address,
         j.ip_forwarded_chain,
         j.os_nom,
         j.navigateur_nom,
         j.appareil_type,
         j.device_fingerprint,
         j.ecran_resolution,
         j.fuseau_horaire,
         j.langue,
         j.geo_source,
         j.geo_latitude,
         j.geo_longitude,
         j.geo_precision_m,
         j.geo_ville,
         j.geo_region,
         j.geo_pays,
         j.geo_fai,
         j.objet,
         j.detail,
         j.previous_hash,
         j.entry_hash,
         j.hmac_signature
       FROM audit.journal j
       LEFT JOIN identity.users u ON u.id = j.user_id
       ${whereSql}
       ORDER BY j.cree_le DESC, j.id DESC
       LIMIT ${limitParam}`,
      params,
    );

    if (opts.exportFmt === 'csv') {
      const content = toCsv(res.rows);
      if (opts.out) {
        fs.writeFileSync(opts.out, content, 'utf8');
        console.error(`Export CSV reussi : ${res.rows.length} ligne(s) -> ${opts.out}`);
      } else {
        process.stdout.write(content);
      }
      return;
    }

    if (opts.exportFmt === 'json') {
      const content = JSON.stringify(res.rows, null, 2) + '\n';
      if (opts.out) {
        fs.writeFileSync(opts.out, content, 'utf8');
        console.error(`Export JSON reussi : ${res.rows.length} ligne(s) -> ${opts.out}`);
      } else {
        process.stdout.write(content);
      }
      return;
    }

    if (res.rows.length === 0) {
      console.log('Aucun evenement forensique trouve pour ces criteres.');
      return;
    }

    console.table(
      res.rows.map((r) => ({
        id: r.id,
        date_utc: r.cree_le,
        utilisateur: r.user_email || r.user_matricule || (r.user_id ? `#${r.user_id}` : '-'),
        role: r.user_role || '-',
        gravite: r.gravite || 'info',
        action: r.action,
        http: r.statut_http ? `${r.methode_http || ''} ${r.statut_http} (${r.duree_ms ?? 0}ms)` : '-',
        ip: r.ip_address || '-',
        machine: [r.os_nom, r.navigateur_nom, r.appareil_type].filter(Boolean).join(' / ') || '-',
        empreinte: r.device_fingerprint ? r.device_fingerprint.slice(0, 12) : '-',
        geo:
          r.geo_latitude != null && r.geo_longitude != null
            ? `${Number(r.geo_latitude).toFixed(4)},${Number(r.geo_longitude).toFixed(4)}${r.geo_ville ? ` (${r.geo_ville})` : ''}`
            : r.geo_ville || r.geo_pays || '-',
      })),
    );
    console.log(`Total affiche : ${res.rows.length} ligne(s). Ajoutez --export csv ou --export json pour l'export complet.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('ERREUR AUDIT CLI:', err.message);
  process.exit(1);
});
