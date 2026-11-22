import assert from 'node:assert/strict';
import test from 'node:test';
import {
  echapperCelluleCsv,
  evaluerAlerteAssiduite,
  genererCsvEmargement,
  TAILLE_MAX_JUSTIFICATIF_OCTETS,
  validerPieceJustificative,
} from './attendanceEnhancements.ts';

test('echapperCelluleCsv neutralise les formules tableur et echappe les guillemets', () => {
  assert.equal(echapperCelluleCsv('=CMD|"/C calc"!A0'), '"\'=CMD|""/C calc""!A0"');
  assert.equal(echapperCelluleCsv('+SUM(A1:A2)'), '"\'+SUM(A1:A2)"');
  assert.equal(echapperCelluleCsv('-1+2'), '"\'-1+2"');
  assert.equal(echapperCelluleCsv('@import'), '"\'@import"');
  assert.equal(echapperCelluleCsv('Amine Benali'), '"Amine Benali"');
});

test('genererCsvEmargement produit un CSV UTF-8 BOM avec metadonnees et taux exact', () => {
  const csv = genererCsvEmargement(
    {
      codeUe: 'INF501',
      intituleUe: 'Algorithmique avancée',
      libelleSeance: 'CM : Cours magistral',
      dateSeance: '2026-11-21',
      presents: 9,
      inscrits: 12,
    },
    [
      {
        matricule: 'DEMO-ETU',
        nom: 'Benali',
        prenom: 'Amine',
        statut: 'Présent',
        horodatage: '08:04:12',
        methode: 'QR Code dynamique',
      },
    ],
  );

  assert.ok(csv.startsWith('\uFEFF'), 'Le CSV doit commencer par le BOM UTF-8');
  assert.ok(csv.includes('"INF501 : Algorithmique avancée"'));
  assert.ok(csv.includes('"9 / 12 (75%)"'));
  assert.ok(csv.includes('"DEMO-ETU";"Benali";"Amine";"Présent";"08:04:12";"QR Code dynamique"'));
});

test('evaluerAlerteAssiduite classe correctement normal, vigilance (>=20%) et critique (>=30%)', () => {
  assert.equal(evaluerAlerteAssiduite(0, 10).niveau, 'normal');
  assert.equal(evaluerAlerteAssiduite(1, 10).niveau, 'normal');

  const vigilance = evaluerAlerteAssiduite(2, 10);
  assert.equal(vigilance.niveau, 'vigilance');
  assert.equal(vigilance.tauxAbsence, 20);

  const critique = evaluerAlerteAssiduite(3, 10);
  assert.equal(critique.niveau, 'critique');
  assert.equal(critique.tauxAbsence, 30);
});

test('validerPieceJustificative applique strictement la liste MIME et la limite de 5 Mo', () => {
  assert.equal(
    validerPieceJustificative({
      name: 'certificat-medical.pdf',
      type: 'application/pdf',
      size: 250_000,
    }).valide,
    true,
  );

  assert.equal(
    validerPieceJustificative({
      name: 'script.html',
      type: 'text/html',
      size: 1024,
    }).valide,
    false,
  );

  assert.equal(
    validerPieceJustificative({
      name: 'photo-trop-lourde.jpg',
      type: 'image/jpeg',
      size: TAILLE_MAX_JUSTIFICATIF_OCTETS + 1,
    }).valide,
    false,
  );
});
