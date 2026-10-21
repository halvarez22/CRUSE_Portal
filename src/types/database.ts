import { Generated } from 'kysely';

// 1. Parámetros Financieros Globales y Catálogos Editables (RN-04, RN-06, RN-08)
export interface SystemFinancialParametersTable {
  param_key: string; // PK
  param_numeric_value: number | null;
  param_text_value: string | null;
  description: string;
  updated_at: Generated<Date | string>;
  updated_by: Generated<string>;
}

export interface CreditBureauCatalogsTable {
  id: string; // PK
  catalog_group: 'OBSERVATION_KEY' | 'CONTRACT_TYPE' | 'PAYMENT_FREQUENCY' | 'ACCOUNT_STATUS';
  code: string;
  description: string;
  active: Generated<1 | 0>;
  updated_at: Generated<Date | string>;
  updated_by: Generated<string>;
}

// 2. Personas Morales — Socios, Representante Legal y Obligados Solidarios (RN-07 y Condición 3)
export interface LegalEntityMembersTable {
  id: string; // PK
  expediente_id: string; // FK -> expedientes(id)
  member_role: 'REPRESENTANTE_LEGAL' | 'SOCIO' | 'ACCIONISTA' | 'OBLIGADO_SOLIDARIO';
  rfc_masked: string;
  blind_rfc: string; // HMAC-SHA256 Blind Index
  encrypted_pii_payload: string; // AES-GCM-256 Envelope Encryption
  kek_version: Generated<number>;
  shareholding_percent: number | null;
  created_at: Generated<Date | string>;
}

// 3. Cuentas de Crédito (Relación 1:N con expedientes — RN-01, RN-05, RN-08, RN-09, RN-12, RN-14 y Condición 1)
export interface LoanAccountsTable {
  id: string; // PK (Permite hasta 4 créditos normales activos por expediente_id)
  contract_number: string; // UNIQUE (NUMERO DE CONTRATO / EQUIVCIA ej. '014-306')
  expediente_id: string; // FK -> expedientes(id)
  principal_original: number;
  current_principal_balance: number;
  fortnightly_payment: number;
  payment_frequency: Generated<'QUINCENAL' | 'MENSUAL' | 'LIBRE'>;
  payroll_source_type: Generated<'ORDINARIA' | 'COMPENSACION' | 'PENSION' | 'EXTERNA'>;
  first_deduction_period: string;
  union_official_letter_no: string | null; // OFICIO 1ER PAGO
  disbursement_method: Generated<'SPEI' | 'CHEQUE' | 'VENTANILLA'>;
  disbursement_reference: string | null; // Número de cheque o Clave Rastreo SPEI
  activated_at: Date | string;
  activated_by: string;
  product_type: 'NOMINA_NORMAL' | 'EXPRESS' | 'ESPECIAL';
  insurance_required: 1 | 0;
  payment_method: 'NOMINA' | 'SPEI' | 'VENTANILLA' | 'CHEQUE';
  status: Generated<'ACTIVE' | 'SUSPENDED_LEAVE' | 'FROZEN_EXTRAJUDICIAL' | 'RESTRUCTURED' | 'PAID_OFF'>;
  reports_to_credit_bureau: 1 | 0;
  capacity_override_flag: Generated<1 | 0>;
  capacity_override_reason: string | null;
  capacity_override_by: string | null;
}

// 4. Aplicación de Pagos con soporte de Desglose Manual en Pagos Parciales (RN-13 y Condición 2)
export interface LoanPaymentApplicationsTable {
  id: string; // PK
  loan_account_id: string; // FK -> loan_accounts(id)
  expediente_id: string; // FK -> expedientes(id)
  batch_id: string;
  reconciliation_item_id: string;
  fortnight_period: string;
  amount_received: number;
  due_insurance: number;
  due_interest: number;
  due_vat: number;
  due_capital: number;
  applied_insurance: number;
  applied_interest: number;
  applied_vat: number;
  applied_capital: number;
  balance_before: number;
  balance_after: number;
  arrears_insurance_after: number;
  arrears_interest_after: number;
  arrears_vat_after: number;
  credit_balance_after: number;
  allocation_mode: Generated<'AUTOMATIC' | 'MANUAL_OVERRIDE'>;
  override_reason: string | null;
  authorized_by: string | null;
  created_at: Generated<Date | string>;
}

// 5. Línea Abierta de Crédito Especial sin Tabla de Amortización (RN-01)
export interface SpecialCreditMovementsTable {
  id: string; // PK
  loan_account_id: string; // FK -> loan_accounts(id)
  movement_date: Date | string;
  movement_type: 'DISPOSICION' | 'ABONO' | 'CARGO_INTERES';
  amount: number;
  balance_before: number;
  balance_after: number;
  disbursement_method: 'SPEI' | 'CHEQUE' | 'EFECTIVO' | 'TRANSFERENCIA' | null;
  reference_number: string | null;
  recorded_by: string;
  created_at: Generated<Date | string>;
}

// 6. Reestructuras y Suspensiones por Licencia sin Goce de Sueldo (RN-10, RN-11)
export interface LoanRestructuresTable {
  id: string; // PK
  new_loan_id: string; // FK -> loan_accounts(id)
  previous_loan_id: string; // FK -> loan_accounts(id)
  absorbed_payoff_amount: number;
  authorized_by: string;
  restructured_at: Generated<Date | string>;
}

export interface LoanSuspensionPeriodsTable {
  id: string; // PK
  loan_account_id: string; // FK -> loan_accounts(id)
  start_period: string;
  end_period: string | null;
  reason: Generated<string>;
  status: Generated<'ACTIVE_SUSPENSION' | 'REACTIVATED'>;
  approved_by: string;
  reactivated_at: Date | string | null;
  created_at: Generated<Date | string>;
}

// 7. Contactos y Documentos (con soporte de Contrato en PDF — RN-03)
export interface ContactsTable {
  id: string;
  expediente_id: string;
  type: 'EMAIL' | 'PHONE';
  encrypted_value: string;
  is_verified: 1 | 0;
  created_at: Generated<Date | string>;
}

export interface DocumentsTable {
  id: string;
  expediente_id: string;
  loan_account_id: string | null; // FK -> loan_accounts(id)
  type: 'INE_FRONT' | 'INE_BACK' | 'PAYSTUB' | 'PROOF_OF_ADDRESS' | 'CONTRACT_PDF' | 'PROMISSORY_NOTE' | 'PAYROLL_MANDATE' | 'OTHER';
  encrypted_s3_key: string;
  upload_date: Generated<Date | string>;
}

// 8. Tablas de Amortización
export interface AmortizationSchedulesTable {
  id: string;
  loan_account_id: string; // FK -> loan_accounts(id)
  period_number: number;
  due_date: Date | string;
  expected_capital: number;
  expected_interest: number;
  expected_vat: number;
  expected_insurance: number;
  expected_payment: number;
  expected_balance: number;
  created_at: Generated<Date | string>;
}

// 9. Pólizas de Seguro de Vida ($35,000 x hasta 4 créditos activos, 18-65 años — RN-08) y Siniestros
export interface InsurancePoliciesTable {
  id: string;
  insurance_company: string;
  policy_number: string;
  coverage_amount: Generated<number>;
  start_date: Date | string;
  end_date: Date | string;
  created_at: Generated<Date | string>;
}

export interface LoanInsuranceEnrollmentsTable {
  id: string; // PK
  policy_id: string; // FK -> insurance_policies(id)
  loan_account_id: string; // FK -> loan_accounts(id)
  insured_amount: Generated<number>; // Fijo $35,000.00 MXN
  period_premium: Generated<number>; // Fijo $22.85 MXN
  first_payment_date: Date | string;
  status: Generated<'ACTIVE' | 'EXCLUDED_AGE_OVER_65' | 'EXCLUDED_DEMANDA' | 'EXCLUDED_CONVENIO' | 'CLOSED'>;
  created_at: Generated<Date | string>;
}

export interface InsuranceClaimsTable {
  id: string;
  policy_id: string;
  loan_account_id: string; // FK -> loan_accounts(id)
  event_date: Date | string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  amount_paid: number | null;
  created_at: Generated<Date | string>;
}

// 10. Módulo de Fondeo e Inversionistas (Simple vs Compuesto / Capitalizado — RN-04 y Condición 4)
export interface InvestorsTable {
  id: string;
  blind_name: string;
  encrypted_name: string;
  isr_retention_rate: number;
  applies_isr: Generated<1 | 0>;
  requires_invoice: Generated<1 | 0>;
  created_at: Generated<Date | string>;
}

export interface InvestmentsTable {
  id: string;
  investor_id: string;
  interest_type: Generated<'SIMPLE' | 'COMPOUND'>;
  capital: number;
  current_capital: Generated<number>;
  annual_rate: number;
  start_date: Date | string;
  status: 'ACTIVE' | 'CLOSED';
  created_at: Generated<Date | string>;
}

export interface InvestmentCapitalMovementsTable {
  id: string; // PK
  investment_id: string; // FK -> investments(id)
  movement_date: Date | string;
  movement_type: 'DEPOSIT' | 'WITHDRAWAL' | 'CAPITALIZATION';
  amount: number;
  capital_before: number;
  capital_after: number;
  reference_number: string;
  recorded_by: string;
  created_at: Generated<Date | string>;
}

export interface InvestorPaymentsTable {
  id: string;
  investor_id: string;
  investment_id: string | null;
  payment_date: Date | string;
  gross_yield: number;
  isr_retained: number;
  net_paid: number;
  reference_number: string;
  created_at: Generated<Date | string>;
}

// 11. Círculo de Crédito y Derechos ARCO
export interface CreditBureauReportsTable {
  id: string;
  reporting_month: string;
  manifest_hash: string;
  created_at: Generated<Date | string>;
}

export interface CreditBureauReportDetailsTable {
  id: string;
  report_id: string;
  loan_account_id: string; // FK -> loan_accounts(id)
  reported_balance: number;
  days_past_due: number;
  observation_code: string | null;
  created_at: Generated<Date | string>;
}

export interface ArcoRequestsTable {
  id: string;
  expediente_id: string;
  request_type: 'ACCESO' | 'RECTIFICACION' | 'CANCELACION' | 'OPOSICION';
  status: 'RECEIVED' | 'IN_PROCESS' | 'RESOLVED';
  resolution_date: Date | string | null;
  created_at: Generated<Date | string>;
}

// 12. Block de Notas Operativas Siempre Visibles (RN-02 y RN-04) y Catálogo Contable
export interface OperationalNotesTable {
  id: string; // PK
  entity_type: 'LOAN_ACCOUNT' | 'INVESTOR' | 'INVESTMENT' | 'EXPEDIENTE';
  entity_id: string;
  note_content: string;
  is_pinned: Generated<1 | 0>;
  author_email: string;
  created_at: Generated<Date | string>;
}

export interface AccountingMovementsCatalogTable {
  code: string;
  description: string;
  nature: 'DEBIT' | 'CREDIT';
  created_at: Generated<Date | string>;
}

export interface Database {
  system_financial_parameters: SystemFinancialParametersTable;
  credit_bureau_catalogs: CreditBureauCatalogsTable;
  legal_entity_members: LegalEntityMembersTable;
  loan_accounts: LoanAccountsTable;
  loan_payment_applications: LoanPaymentApplicationsTable;
  special_credit_movements: SpecialCreditMovementsTable;
  loan_restructures: LoanRestructuresTable;
  loan_suspension_periods: LoanSuspensionPeriodsTable;
  contacts: ContactsTable;
  documents: DocumentsTable;
  amortization_schedules: AmortizationSchedulesTable;
  insurance_policies: InsurancePoliciesTable;
  loan_insurance_enrollments: LoanInsuranceEnrollmentsTable;
  insurance_claims: InsuranceClaimsTable;
  investors: InvestorsTable;
  investments: InvestmentsTable;
  investment_capital_movements: InvestmentCapitalMovementsTable;
  investor_payments: InvestorPaymentsTable;
  credit_bureau_reports: CreditBureauReportsTable;
  credit_bureau_report_details: CreditBureauReportDetailsTable;
  arco_requests: ArcoRequestsTable;
  operational_notes: OperationalNotesTable;
  accounting_movements_catalog: AccountingMovementsCatalogTable;
}
