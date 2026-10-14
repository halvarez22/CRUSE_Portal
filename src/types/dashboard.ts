export interface DashboardKPIs {
  capitalColocado: number;
  capitalVigente: number;
  creditosActivos: number;
  carteraVencida: number;
}

export interface LatestLoan {
  id: string;
  fullName: string;
  curpMasked: string;
  amount: number;
  status: 'capturado' | 'conciliado' | 'aprobado' | 'rechazado';
  date: string;
  productType: 'normal' | 'express' | 'especial';
}

export interface ExpedientDetails {
  id: string;
  fullName: string;
  curp: string; // Unmasked PII
  rfc: string;  // Unmasked PII
  address: string;
  phone: string;
  voterId: string;
  productType: string;
  requestedAmount: number;
  termFortnights: number;
  status: string;
  createdAt: string;
}
