import { useState, useEffect } from 'react';
import { DashboardKPIs, LatestLoan, ExpedientDetails } from '../types/dashboard';

export function useDashboardData() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [latestLoans, setLatestLoans] = useState<LatestLoan[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [loansLoading, setLoansLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWithAuth = async (url: string) => {
    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Error fetching ${url}: ${res.statusText}`);
    }
    return res.json();
  };

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      try {
        setKpisLoading(true);
        setLoansLoading(true);
        setError(null);
        
        const [kpisData, loansData] = await Promise.all([
          fetchWithAuth('/api/dashboard/kpis'),
          fetchWithAuth('/api/dashboard/latest_loans')
        ]);
        
        if (mounted) {
          setKpis(kpisData);
          setLatestLoans(loansData);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Error loading dashboard data');
        }
      } finally {
        if (mounted) {
          setKpisLoading(false);
          setLoansLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const fetchExpedientDetails = async (id: string): Promise<ExpedientDetails> => {
    return fetchWithAuth(`/api/expedientes/${id}/details`);
  };

  return {
    kpis,
    latestLoans,
    kpisLoading,
    loansLoading,
    error,
    fetchExpedientDetails
  };
}
