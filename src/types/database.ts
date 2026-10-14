import { Generated } from 'kysely';

// 1. Extending loan_accounts (which wasn't in Kysely before, defined here for DB interface)
export interface LoanAccountsTable {
  expediente_id: string; // PK
  principal_original: number;
  fortnightly_payment: number;
  first_deduction_period: string;
  activated_at: Date | string;
  activated_by: string;
  product_type: 'NOMINA_NORMAL' | 'EXPRESS' | 'ESPECIAL';
  insurance_required: 1 | 0;
  payment_method: 'NOMINA' | 'SPEI' | 'VENTANILLA';
  reports_to_credit_bureau: 1 | 0;
}

// 2. Contacts
export interface ContactsTable {
  id: string;
  expediente_id: string;
  type: 'EMAIL' | 'PHONE';
  encrypted_value: string;
  is_verified: 1 | 0;
  created_at: Generated<Date | string>;
}

// 3. Documents
export interface DocumentsTable {
  id: string;
  expediente_id: string;
  type: 'INE_FRONT' | 'INE_BACK' | 'PAYSTUB' | 'PROOF_OF_ADDRESS' | 'OTHER';
  encrypted_s3_key: string;
  upload_date: Generated<Date | string>;
}

// 4. Amortization Schedules
export interface AmortizationSchedulesTable {
  id: string;
  loan_account_id: string;
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

// 5. Insurance Policies & Claims
export interface InsurancePoliciesTable {
  id: string;
  insurance_company: string;
  policy_number: string;
  coverage_amount: Generated<number>;
  start_date: Date | string;
  end_date: Date | string;
  created_at: Generated<Date | string>;
}

export interface InsuranceClaimsTable {
  id: string;
  policy_id: string;
  loan_account_id: string;
  event_date: Date | string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  amount_paid: number | null;
  created_at: Generated<Date | string>;
}

// 6. Investors, Investments, Investor Payments
export interface InvestorsTable {
  id: string;
  blind_name: string;
  encrypted_name: string;
  isr_retention_rate: number;
  created_at: Generated<Date | string>;
}

export interface InvestmentsTable {
  id: string;
  investor_id: string;
  capital: number;
  annual_rate: number;
  start_date: Date | string;
  status: 'ACTIVE' | 'CLOSED';
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

// 7. Credit Bureau & ARCO
export interface CreditBureauReportsTable {
  id: string;
  reporting_month: string;
  manifest_hash: string;
  created_at: Generated<Date | string>;
}

export interface CreditBureauReportDetailsTable {
  id: string;
  report_id: string;
  loan_account_id: string;
  reported_balance: number;
  days_past_due: number;
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

// 8. Accounting Movements Catalog
export interface AccountingMovementsCatalogTable {
  code: string;
  description: string;
  nature: 'DEBIT' | 'CREDIT';
  created_at: Generated<Date | string>;
}

export interface Database {
  loan_accounts: LoanAccountsTable;
  contacts: ContactsTable;
  documents: DocumentsTable;
  amortization_schedules: AmortizationSchedulesTable;
  insurance_policies: InsurancePoliciesTable;
  insurance_claims: InsuranceClaimsTable;
  investors: InvestorsTable;
  investments: InvestmentsTable;
  investor_payments: InvestorPaymentsTable;
  credit_bureau_reports: CreditBureauReportsTable;
  credit_bureau_report_details: CreditBureauReportDetailsTable;
  arco_requests: ArcoRequestsTable;
  accounting_movements_catalog: AccountingMovementsCatalogTable;
}
