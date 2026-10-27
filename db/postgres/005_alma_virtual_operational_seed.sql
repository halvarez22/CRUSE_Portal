-- ============================================================================
-- MICROFINANCIERA CRUSE, S.A. DE C.V., SOFOM, E.N.R.
-- MIGRACIÓN 005: SEED OPERATIVO MULTIDOMINIO PARA "ALMA VIRTUAL" (3FN v4)
-- Expediente: CRUSE-APO-2026-033 (Guardrail Forense 3: 100% Idempotente, Cero UPDATE/DELETE)
-- Propósito: Poblar registros operativos representativos con datos enmascarados
--            (Zero-PII) en las tablas de los 5 dominios de Alma Virtual.
-- ============================================================================

-- 1. EXPEDIENTES REPRESENTATIVOS MULTICONVENIO (CERO PII EN CLARO — BLIND INDEXING)
INSERT INTO expedientes (
  id, created_at, updated_at, convenio, full_name, curp_masked, blind_curp,
  voter_id, address, phone, requested_amount, term_fortnights, product_type,
  status, promotor_email, person_type, rfc_masked, blind_rfc, gender,
  birth_date, gross_income, payroll_deductions
) VALUES
  (
    'exp_alma_stj_001',
    '2026-09-15T10:00:00Z',
    '2026-10-15T10:00:00Z',
    'SUPREMO_TRIBUNAL',
    'R****** M******* G*****',
    'MAGR************01',
    'a101bc8891f04e52991234567890abcdef11223344556677889900aabbccdd01',
    'IDMEX2026001',
    'DOMICILIO PROTEGIDO AES-GCM-256',
    '614*****01',
    20000.00,
    24,
    'NOMINA_NORMAL',
    'aprobado',
    'promotor@cruse.com.mx',
    'FISICA',
    'MAGR******H01',
    'b101bc8891f04e52991234567890abcdef11223344556677889900aabbccdd01',
    'M',
    '1982-06-14',
    18500.00,
    2100.00
  ),
  (
    'exp_alma_stj_002',
    '2026-10-05T11:30:00Z',
    '2026-10-18T11:30:00Z',
    'SUPREMO_TRIBUNAL',
    'C***** E**** V****** R***',
    'VARC************02',
    'a202bc8891f04e52991234567890abcdef11223344556677889900aabbccdd02',
    'IDMEX2026002',
    'DOMICILIO PROTEGIDO AES-GCM-256',
    '614*****02',
    25000.00,
    24,
    'NOMINA_NORMAL',
    'aprobado',
    'promotor@cruse.com.mx',
    'FISICA',
    'VARC******M02',
    'b202bc8891f04e52991234567890abcdef11223344556677889900aabbccdd02',
    'F',
    '1979-11-22',
    22000.00,
    1800.00
  ),
  (
    'exp_alma_sts_001',
    '2026-08-20T09:15:00Z',
    '2026-10-15T09:15:00Z',
    'STSGECH',
    'H******* O***** T******',
    'ORTA************03',
    'a303bc8891f04e52991234567890abcdef11223344556677889900aabbccdd03',
    'IDMEX2026003',
    'DOMICILIO PROTEGIDO AES-GCM-256',
    '614*****03',
    16000.00,
    24,
    'NOMINA_NORMAL',
    'aprobado',
    'promotor@cruse.com.mx',
    'FISICA',
    'ORTA******H03',
    'b303bc8891f04e52991234567890abcdef11223344556677889900aabbccdd03',
    'M',
    '1954-03-12',
    14800.00,
    1500.00
  ),
  (
    'exp_alma_sts_002',
    '2026-09-01T14:20:00Z',
    '2026-10-15T14:20:00Z',
    'STSGECH',
    'L**** F******* S******',
    'SALF************04',
    'a404bc8891f04e52991234567890abcdef11223344556677889900aabbccdd04',
    'IDMEX2026004',
    'DOMICILIO PROTEGIDO AES-GCM-256',
    '614*****04',
    5000.00,
    12,
    'EXPRESS',
    'aprobado',
    'promotor@cruse.com.mx',
    'FISICA',
    'SALF******M04',
    'b404bc8891f04e52991234567890abcdef11223344556677889900aabbccdd04',
    'F',
    '1990-07-08',
    12400.00,
    1100.00
  ),
  (
    'exp_alma_salud_001',
    '2026-09-10T12:00:00Z',
    '2026-10-15T12:00:00Z',
    'SINDICATO_SALUD_GTO',
    'M**** G******* R******',
    'ROGM************05',
    'a505bc8891f04e52991234567890abcdef11223344556677889900aabbccdd05',
    'IDMEX2026005',
    'DOMICILIO PROTEGIDO AES-GCM-256',
    '477*****05',
    18000.00,
    24,
    'NOMINA_NORMAL',
    'aprobado',
    'promotor@cruse.com.mx',
    'FISICA',
    'ROGM******M05',
    'b505bc8891f04e52991234567890abcdef11223344556677889900aabbccdd05',
    'F',
    '1986-04-19',
    19600.00,
    2200.00
  ),
  (
    'exp_alma_salud_002',
    '2026-06-15T16:00:00Z',
    '2026-10-15T16:00:00Z',
    'SINDICATO_SALUD_GTO',
    'D***** A****** C*****',
    'CADI************06',
    'a606bc8891f04e52991234567890abcdef11223344556677889900aabbccdd06',
    'IDMEX2026006',
    'DOMICILIO PROTEGIDO AES-GCM-256',
    '477*****06',
    6000.00,
    12,
    'EXPRESS',
    'aprobado',
    'promotor@cruse.com.mx',
    'FISICA',
    'CADI******H06',
    'b606bc8891f04e52991234567890abcdef11223344556677889900aabbccdd06',
    'M',
    '1988-09-25',
    13200.00,
    1950.00
  )
ON CONFLICT (id) DO NOTHING;

-- 2. CUENTAS DE CRÉDITO REPRESENTATIVAS (NORMAL, EXPRESS < $1,000, CHEQUE, JUBILADO SIN SEGURO, SALUD)
INSERT INTO loan_accounts (
  id, contract_number, expediente_id, principal_original, current_principal_balance,
  fortnightly_payment, payment_frequency, payroll_source_type, first_deduction_period,
  union_official_letter_no, disbursement_method, disbursement_reference, activated_at,
  activated_by, product_type, insurance_required, payment_method, status, reports_to_credit_bureau
) VALUES
  (
    'la_alma_stj_001',
    'CNT-2026-0201',
    'exp_alma_stj_001',
    20000.00,
    18500.00,
    845.00,
    'QUINCENAL',
    'ORDINARIA',
    '2026-10-1Q',
    'OF-STJ-2026-088',
    'SPEI',
    'SPEI-992817261',
    '2026-09-20T14:00:00Z',
    'alma.operaciones@crusefintech.mx',
    'NOMINA_NORMAL',
    1,
    'NOMINA',
    'ACTIVE',
    1
  ),
  (
    'la_alma_stj_002',
    'CNT-2026-0202',
    'exp_alma_stj_002',
    25000.00,
    24200.00,
    1120.00,
    'QUINCENAL',
    'ORDINARIA',
    '2026-10-2Q',
    'OF-STJ-2026-104',
    'CHEQUE',
    'CHQ-BBVA-004829',
    '2026-10-12T11:15:00Z',
    'alma.operaciones@crusefintech.mx',
    'NOMINA_NORMAL',
    1,
    'NOMINA',
    'ACTIVE',
    1
  ),
  (
    'la_alma_sts_001',
    'CNT-2026-0203',
    'exp_alma_sts_001',
    16000.00,
    14200.00,
    690.00,
    'QUINCENAL',
    'JUBILADO_PENSIONADO',
    '2026-09-1Q',
    'OF-STSGECH-2026-412',
    'CHEQUE',
    'CHQ-BANORTE-009182',
    '2026-10-08T10:30:00Z',
    'admin@cruse.com.mx',
    'NOMINA_NORMAL',
    0,
    'NOMINA',
    'ACTIVE',
    1
  ),
  (
    'la_alma_sts_002',
    'CNT-2026-0204',
    'exp_alma_sts_002',
    5000.00,
    680.00,
    365.00,
    'QUINCENAL',
    'ORDINARIA',
    '2026-05-1Q',
    'OF-STSGECH-2026-119',
    'SPEI',
    'SPEI-771829104',
    '2026-05-02T09:00:00Z',
    'admin@cruse.com.mx',
    'EXPRESS',
    1,
    'NOMINA',
    'ACTIVE',
    1
  ),
  (
    'la_alma_salud_001',
    'CNT-2026-0205',
    'exp_alma_salud_001',
    18000.00,
    16000.00,
    740.00,
    'QUINCENAL',
    'ORDINARIA',
    '2026-10-1Q',
    'OF-SALUD-GTO-2026-055',
    'SPEI',
    'SPEI-661928374',
    '2026-09-18T13:45:00Z',
    'alma.operaciones@crusefintech.mx',
    'NOMINA_NORMAL',
    1,
    'NOMINA',
    'ACTIVE',
    1
  ),
  (
    'la_alma_salud_002',
    'CNT-2026-0206',
    'exp_alma_salud_002',
    6000.00,
    4500.00,
    615.00,
    'QUINCENAL',
    'ORDINARIA',
    '2026-06-2Q',
    'OF-SALUD-GTO-2026-019',
    'SPEI',
    'SPEI-551827364',
    '2026-06-15T16:30:00Z',
    'admin@cruse.com.mx',
    'EXPRESS',
    1,
    'NOMINA',
    'PAST_DUE',
    1
  )
ON CONFLICT (id) DO NOTHING;

-- 3. LOTES Y PARTIDAS DE CONCILIACIÓN QUINCENAL (PAGOS PARCIALES EN 2026-10-1Q)
INSERT INTO reconciliation_batches (
  id, created_at, agreement_name, fortnight_period, total_records,
  total_amount_expected, total_amount_received, status, officer_email,
  batch_manifest_hash, notes
) VALUES
  (
    'rb_alma_stj_2026_10_1q',
    '2026-10-15T17:00:00Z',
    'SUPREMO_TRIBUNAL',
    '2026-10-1Q',
    2,
    1965.00,
    1420.00,
    'procesado',
    'alma.operaciones@crusefintech.mx',
    'f1e2d3c4b5a697887766554433221100ffeeddccbbaa99887766554433221101',
    'Conciliación quincenal 2026-10-1Q Supremo Tribunal con retención parcial de $300.00 en CNT-2026-0201'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_items (
  id, batch_id, expediente_id, blind_curp, curp_masked, employee_name,
  expected_payment, actual_payment, difference, status, audit_notes
) VALUES
  (
    'ri_alma_stj_300',
    'rb_alma_stj_2026_10_1q',
    'exp_alma_stj_001',
    'a101bc8891f04e52991234567890abcdef11223344556677889900aabbccdd01',
    'MAGR************01',
    'R****** M******* G*****',
    845.00,
    300.00,
    -545.00,
    'DISCREPANCY_UNDERPAYMENT',
    'Pago parcial recibido ($300.00 de $845.00 esperados) • Contrato CNT-2026-0201'
  ),
  (
    'ri_alma_sts_450',
    'rb_1791578418589_ad1ed68c',
    'exp_alma_sts_001',
    'a303bc8891f04e52991234567890abcdef11223344556677889900aabbccdd03',
    'ORTA************03',
    'H******* O***** T******',
    690.00,
    450.00,
    -240.00,
    'DISCREPANCY_UNDERPAYMENT',
    'Pago parcial sindicato STSGECH en 2026-10-1Q • Contrato CNT-2026-0203'
  )
ON CONFLICT (id) DO NOTHING;

-- 4. APLICACIONES DE PAGO CON PRELACIÓN WORM (SEGURO -> INTERÉS -> IVA -> CAPITAL)
INSERT INTO loan_payment_applications (
  id, loan_account_id, expediente_id, batch_id, reconciliation_item_id,
  fortnight_period, amount_received, due_insurance, due_interest, due_vat,
  due_capital, applied_insurance, applied_interest, applied_vat, applied_capital,
  balance_before, balance_after, arrears_insurance_after, arrears_interest_after,
  arrears_vat_after, credit_balance_after, allocation_mode, override_reason,
  authorized_by, created_at
) VALUES
  (
    'lpa_alma_stj_300',
    'la_alma_stj_001',
    'exp_alma_stj_001',
    'rb_alma_stj_2026_10_1q',
    'ri_alma_stj_300',
    '2026-10-1Q',
    300.00,
    22.85,
    182.25,
    29.16,
    610.74,
    22.85,
    182.25,
    29.16,
    65.74,
    18565.74,
    18500.00,
    0.00,
    0.00,
    0.00,
    0.00,
    'MANUAL_OVERRIDE',
    'Ajuste manual de prelación sobre pago parcial de $300.00 autorizado por Mesa de Control',
    'alma.operaciones@crusefintech.mx',
    '2026-10-15T17:10:00Z'
  ),
  (
    'lpa_alma_sts_450',
    'la_alma_sts_001',
    'exp_alma_sts_001',
    'rb_1791578418589_ad1ed68c',
    'ri_alma_sts_450',
    '2026-10-1Q',
    450.00,
    0.00,
    210.00,
    33.60,
    446.40,
    0.00,
    210.00,
    33.60,
    206.40,
    14406.40,
    14200.00,
    0.00,
    0.00,
    0.00,
    0.00,
    'AUTOMATIC',
    NULL,
    NULL,
    '2026-10-15T16:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- 5. REESTRUCTURAS N-A-1 (EXCLUSIVAMENTE ENTRE CRÉDITOS NOMINA_NORMAL, RN-02)
INSERT INTO loan_restructures (
  id, new_loan_id, previous_loan_id, absorbed_payoff_amount, authorized_by, restructured_at
) VALUES
  (
    'lr_alma_2026_001',
    'la_multi_026_live_second',
    'la_13998147-213c-4012-afb6-832e8274a4d6',
    8450.00,
    'admin@cruse.com.mx',
    '2026-10-18T12:30:00Z'
  ),
  (
    'lr_alma_2026_002',
    'la_alma_stj_001',
    'la_063aff29-9717-40c9-8fda-ea206ffc3ffb',
    6120.00,
    'alma.operaciones@crusefintech.mx',
    '2026-09-20T13:50:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- 6. DOCUMENTOS DE EXPEDIENTE (OFICIO DE 1ER PAGO Y PAGARÉ)
INSERT INTO documents (
  id, expediente_id, loan_account_id, type, encrypted_s3_key, upload_date
) VALUES
  (
    'doc_alma_oficio_0001',
    'exp_test',
    'la_063aff29-9717-40c9-8fda-ea206ffc3ffb',
    'OFICIO_PRIMER_PAGO',
    's3://cruse-vault-prod/oficios/2026/OFICIO_1ER_PAGO_CNT_2026_0001.enc',
    '2026-09-10T10:00:00Z'
  ),
  (
    'doc_alma_oficio_9027',
    'exp_e5cc39bf7b922bc6',
    'la_multi_026_live_second',
    'OFICIO_PRIMER_PAGO',
    's3://cruse-vault-prod/oficios/2026/OFICIO_1ER_PAGO_CNT_2026_9027.enc',
    '2026-10-18T12:40:00Z'
  ),
  (
    'doc_alma_oficio_0201',
    'exp_alma_stj_001',
    'la_alma_stj_001',
    'OFICIO_PRIMER_PAGO',
    's3://cruse-vault-prod/oficios/2026/OFICIO_1ER_PAGO_CNT_2026_0201.enc',
    '2026-09-20T14:05:00Z'
  ),
  (
    'doc_alma_oficio_0205',
    'exp_alma_salud_001',
    'la_alma_salud_001',
    'OFICIO_PRIMER_PAGO',
    's3://cruse-vault-prod/oficios/2026/OFICIO_1ER_PAGO_CNT_2026_0205.enc',
    '2026-09-18T14:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- 7. SEGURO DE VIDA COLECTIVO ($35,000 MXN), EXCEPCIONES POR EDAD Y SINIESTROS
INSERT INTO loan_insurance_enrollments (
  id, policy_id, loan_account_id, insured_amount, period_premium, first_payment_date, status, created_at
) VALUES
  (
    'lie_alma_stj_001',
    'pol_colectiva_2026',
    'la_alma_stj_001',
    35000.00,
    22.85,
    '2026-10-15',
    'ACTIVE',
    '2026-09-20T14:00:00Z'
  ),
  (
    'lie_alma_stj_002',
    'pol_colectiva_2026',
    'la_alma_stj_002',
    35000.00,
    22.85,
    '2026-10-30',
    'ACTIVE',
    '2026-10-12T11:15:00Z'
  ),
  (
    'lie_alma_sts_jubilado',
    'pol_colectiva_2026',
    'la_alma_sts_001',
    0.00,
    0.00,
    '2026-09-15',
    'EXCLUDED_AGE_OVER_65',
    '2026-10-08T10:30:00Z'
  ),
  (
    'lie_alma_salud_001',
    'pol_colectiva_2026',
    'la_alma_salud_001',
    35000.00,
    22.85,
    '2026-10-15',
    'ACTIVE',
    '2026-09-18T13:45:00Z'
  ),
  (
    'lie_alma_salud_002',
    'pol_colectiva_2026',
    'la_alma_salud_002',
    35000.00,
    22.85,
    '2026-06-30',
    'ACTIVE',
    '2026-06-15T16:30:00Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO insurance_claims (
  id, policy_id, loan_account_id, event_date, status, amount_paid, created_at
) VALUES
  (
    'clm_alma_2026_10_001',
    'pol_colectiva_2026',
    'la_0b3de409-fe07-465a-9151-708f8a119dae',
    '2026-10-14',
    'EN_DICTAMEN_FALLECIMIENTO',
    35000.00,
    '2026-10-16T09:30:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- 8. DETALLES DE REPORTE A CÍRCULO DE CRÉDITO (DPD > 90 Y CARTERA NORMAL/EXPRESS)
INSERT INTO credit_bureau_report_details (
  id, report_id, loan_account_id, reported_balance, days_past_due, observation_code, created_at
) VALUES
  (
    'cbrd_alma_001',
    'cbr_1791581183842',
    'la_063aff29-9717-40c9-8fda-ea206ffc3ffb',
    9681.93,
    0,
    'CC',
    '2026-10-25T18:00:00Z'
  ),
  (
    'cbrd_alma_002',
    'cbr_1791581183842',
    'la_multi_026_live_second',
    12000.00,
    15,
    'PC',
    '2026-10-25T18:00:00Z'
  ),
  (
    'cbrd_alma_003',
    'cbr_1791581183842',
    'la_0b3de409-fe07-465a-9151-708f8a119dae',
    28450.00,
    95,
    'UP',
    '2026-10-25T18:00:00Z'
  ),
  (
    'cbrd_alma_004',
    'cbr_1791581183842',
    'la_alma_salud_002',
    4500.00,
    120,
    'UP',
    '2026-10-25T18:00:00Z'
  ),
  (
    'cbrd_alma_005',
    'cbr_1791581183842',
    'la_alma_stj_001',
    18500.00,
    0,
    'RV',
    '2026-10-25T18:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- 9. SOLICITUDES DE DERECHOS ARCO (LFPDPPP) Y NOTAS OPERATIVAS DE EXPEDIENTE
INSERT INTO arco_requests (
  id, expediente_id, request_type, status, resolution_date, created_at
) VALUES
  (
    'arco_alma_2026_001',
    'exp_548643a5f90b3746',
    'CANCELACION',
    'PENDIENTE_RESOLUCION',
    NULL,
    '2026-10-21T11:20:00Z'
  ),
  (
    'arco_alma_2026_002',
    'exp_test',
    'ACCESO',
    'RESUELTO_FAVORABLE',
    '2026-10-20T15:00:00Z',
    '2026-10-18T09:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO operational_notes (
  id, entity_type, entity_id, note_content, is_pinned, author_email, created_at
) VALUES
  (
    'note_alma_cnt_0201',
    'LOAN_ACCOUNT',
    'la_alma_stj_001',
    '[MESA_CONTROL · CNT-2026-0201] Validado Oficio de 1er Pago del Supremo Tribunal y aplicado pago parcial de $300.00 con prelación WORM ($22.85 Seguro, $182.25 Interés, $29.16 IVA, $65.74 Capital).',
    1,
    'alma.operaciones@crusefintech.mx',
    '2026-10-15T17:15:00Z'
  ),
  (
    'note_alma_cnt_9027',
    'LOAN_ACCOUNT',
    'la_multi_026_live_second',
    '[REESTRUCTURA N-A-1 · CNT-2026-9027] Crédito originado por absorción de saldo insoluto de CNT-2026-0052 ($8,450.00 MXN) bajo autorización de Dirección.',
    1,
    'admin@cruse.com.mx',
    '2026-10-18T12:35:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- 10. EVENTOS DE BITÁCORA FORENSE WORM (AJUSTE MANUAL DE CAPITAL Y REESTRUCTURA)
INSERT INTO audit_events (
  id, ts, actor_email, actor_role, action, outcome, source_ip, source_summary,
  curp_masked, blind_curp_prefix, expediente_id, details, prev_hash, record_hash,
  hash_version, chain_seq
) VALUES
  (
    'aud_alma_manual_cap_001',
    '2026-10-15T17:10:05Z',
    'alma.operaciones@crusefintech.mx',
    'admin',
    'PAYMENT_MANUAL_CAPITAL_OVERRIDE',
    'success',
    '187.189.95.52',
    'Mesa de Control · Prelación WORM',
    'MAGR************01',
    'a101bc8891f04e52',
    'exp_alma_stj_001',
    '{"contract_number":"CNT-2026-0201","fortnight_period":"2026-10-1Q","amount_received":300.00,"applied_insurance":22.85,"applied_interest":182.25,"applied_vat":29.16,"applied_capital":65.74,"allocation_mode":"MANUAL_OVERRIDE"}',
    '0000000000000000000000000000000000000000000000000000000000000000',
    '99aabbccddeeff00112233445566778899aabbccddeeff001122334455667701',
    2,
    NULL
  ),
  (
    'aud_alma_restructure_001',
    '2026-10-18T12:30:10Z',
    'admin@cruse.com.mx',
    'admin',
    'LOAN_RESTRUCTURED',
    'success',
    '187.189.95.52',
    'Comité de Crédito · Reestructura N-a-1',
    'MORA************08',
    'c041b3aff8c135da',
    'exp_e5cc39bf7b922bc6',
    '{"new_contract":"CNT-2026-9027","previous_contract":"CNT-2026-0052","absorbed_payoff_amount":8450.00,"authorized_by":"admin@cruse.com.mx"}',
    '99aabbccddeeff00112233445566778899aabbccddeeff001122334455667701',
    '99aabbccddeeff00112233445566778899aabbccddeeff001122334455667702',
    2,
    NULL
  )
ON CONFLICT (id) DO NOTHING;
