export interface DashboardKPIs {
  capitalColocado: number;
  capitalVigente: number;
  creditosActivos: number;
  carteraVencida: number;
}

export interface LatestLoan {
  id: string;
  convenio?: string;
  fullName: string;
  curpMasked: string;
  curp?: string;
  amount: number;
  payment?: number;
  termFortnights?: number;
  status: 'capturado' | 'conciliado' | 'aprobado' | 'rechazado' | 'activo' | 'liquidado';
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
