import React, { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { HeaderNavbar } from './components/common/HeaderNavbar';
import { HeroPedestalSection } from './components/public/HeroPedestalSection';
import { PublicCreditSimulator } from './components/public/PublicCreditSimulator';
import { RequirementsGlassSlabs } from './components/public/RequirementsGlassSlabs';
import { OperationalPhases } from './components/public/OperationalPhases';
import { InstitutionalAlliance } from './components/public/InstitutionalAlliance';
import { AiAssistantPublic } from './components/public/AiAssistantPublic';
import { ContactEcosystemSlab } from './components/public/ContactEcosystemSlab';
import { FooterPublic } from './components/public/FooterPublic';
import { Login2FAModal } from './components/auth/Login2FAModal';
import { PromotorScannerView } from './components/promotor/PromotorScannerView';
import { AdminAuditView } from './components/admin/AdminAuditView';
import { AuthSession } from './types';
import { ShieldCheck, UserCheck } from 'lucide-react';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [show2FaModal, setShow2FaModal] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [currentView, setCurrentView] = useState<'public' | 'private'>('public');

  // Si el usuario está autenticado y desea ver su módulo privado
  if (session && currentView === 'private') {
    if (session.user.role === 'promotor') {
      return (
        <PromotorScannerView
          session={session}
          onBackToPortal={() => setCurrentView('public')}
        />
      );
    }

    return (
      <AdminAuditView
        session={session}
        onLogout={() => {
          setSession(null);
          setCurrentView('public');
        }}
        onBackToPortal={() => setCurrentView('public')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#030914] text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-[#249E82] selection:text-white transition-colors duration-300 relative overflow-x-hidden">
      
      {/* Background Ambient Glowing Orbs (GPU accelerated) */}
      <div className="fixed top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[#041734] opacity-20 dark:opacity-60 blur-[130px] pointer-events-none -z-10 gpu-accelerated" />
      <div className="fixed top-[25%] right-[-10%] w-[550px] h-[550px] rounded-full bg-[#1E9F81] opacity-15 dark:opacity-20 blur-[150px] pointer-events-none -z-10 gpu-accelerated" />
      <div className="fixed bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-[#396CAE] opacity-15 dark:opacity-25 blur-[160px] pointer-events-none -z-10 gpu-accelerated" />

      {/* Barra de estado si hay sesión activa pero el usuario está viendo el portal público */}
      {session && (
        <div className="bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white py-1.5 px-4 text-xs font-semibold flex items-center justify-between sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            <span>Sesión 2FA Activa: {session.user.name} ({session.user.role.replace('_', ' ').toUpperCase()})</span>
          </div>
          <button
            onClick={() => setCurrentView('private')}
            className="px-3 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all text-xs font-bold flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Abrir Mi Módulo Privado</span>
          </button>
        </div>
      )}

      {/* Sticky Master Header Navigation */}
      <HeaderNavbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenInstitutionalAccess={() => {
          if (session) {
            setCurrentView('private');
          } else {
            setShow2FaModal(true);
          }
        }}
      />

      {/* Main Public Content */}
      <main className="space-y-4 pt-24">
        {/* 1. Hero with 3D Frosted Pedestal (Slide 1) */}
        <HeroPedestalSection />

        {/* 2. Official Credit Simulator with Amortization Schedule (Slide 4) */}
        <PublicCreditSimulator />

        {/* 3. Requirements on 3D Floating Glass Slabs (Slide 4) */}
        <RequirementsGlassSlabs />

        {/* 4. Operational Phases of Zero-Friction Delivery (Slides 3, 4, 5) */}
        <OperationalPhases />

        {/* 5. Institutional Agreements & Synergy Matrix (Slides 2, 6, 7, 8) */}
        <InstitutionalAlliance />

        {/* 6. AI 24/7 Citizen Assistant with Zero-PII Sanitization */}
        <AiAssistantPublic />

        {/* 7. Institutional Contact Slab from Saucito HQ (Slide 9) */}
        <ContactEcosystemSlab />
      </main>

      {/* Footer with Regulatory Seals */}
      <FooterPublic />

      {/* Modal Auténtico 2FA TOTP con Rate Limiting */}
      <Login2FAModal
        isOpen={show2FaModal}
        onClose={() => setShow2FaModal(false)}
        onLoginSuccess={(newSession) => {
          setSession(newSession);
          setCurrentView('private');
        }}
      />

    </div>
  );
}

