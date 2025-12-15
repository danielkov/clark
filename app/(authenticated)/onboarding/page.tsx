/**
 * Onboarding Page
 * 
 * Guides users through setting up their ATS Container Initiative
 */

import { redirect } from 'next/navigation';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { hasLinearConnected } from '@/lib/linear/client';
import { hasATSContainer } from '@/lib/linear/initiatives';
import { InitiativeSelector } from '@/components/initiative-selector';

export default async function OnboardingPage() {
  const { user } = await withAuth({ ensureSignedIn: true });

  // Check if Linear is connected
  const linearConnected = await hasLinearConnected();
  
  if (!linearConnected) {
    // Redirect to Linear authorization
    redirect('/api/linear/authorize');
  }

  // Check if ATS Container is already set
  const hasContainer = await hasATSContainer();
  
  if (hasContainer) {
    // Already onboarded, redirect to dashboard
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <InitiativeSelector />
      </div>
    </div>
  );
}
