/**
 * Usage Limit Warning Component
 * 
 * Displays a warning banner when meter balance is running low (below 20%).
 * Provides a call-to-action to upgrade subscription tier.
 * 
 * Requirements: 3.4
 */

import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export interface UsageLimitWarningProps {
  meterName: 'job_descriptions' | 'candidate_screenings';
  balance: number;
  creditedUnits: number;
  onUpgrade?: () => void;
}

export function UsageLimitWarning({
  meterName,
  balance,
  creditedUnits,
  onUpgrade,
}: UsageLimitWarningProps) {
  const displayName =
    meterName === 'job_descriptions'
      ? 'job descriptions'
      : 'candidate screenings';

  const percentageRemaining =
    creditedUnits > 0 ? Math.round((balance / creditedUnits) * 100) : 0;

  // Only show warning if below 20%
  if (percentageRemaining >= 20) {
    return null;
  }

  return (
    <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
        
        <div className="flex-1 space-y-2">
          <div>
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
              Low Usage Balance
            </h3>
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
              You have {balance.toLocaleString()} {displayName} remaining (
              {percentageRemaining}% of your monthly allowance). Consider upgrading
              to avoid service interruption.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onUpgrade ? (
              <Button
                onClick={onUpgrade}
                size="sm"
                variant="default"
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                Upgrade Plan
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                asChild
                size="sm"
                variant="default"
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                <Link href="/subscription">
                  View Plans
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
