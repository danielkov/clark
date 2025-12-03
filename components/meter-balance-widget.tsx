/**
 * Meter Balance Widget Component
 * 
 * Displays current meter balance with a progress bar showing consumption.
 * Used on the dashboard to show remaining allowances for job descriptions
 * and candidate screenings.
 * 
 * Requirements: 3.1
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Users } from 'lucide-react';

export interface MeterBalanceWidgetProps {
  meterName: 'job_descriptions' | 'candidate_screenings';
  balance: number;
  consumedUnits: number;
  creditedUnits: number;
  unlimited?: boolean;
}

export function MeterBalanceWidget({
  meterName,
  balance,
  consumedUnits,
  creditedUnits,
  unlimited = false,
}: MeterBalanceWidgetProps) {
  const displayName =
    meterName === 'job_descriptions'
      ? 'Job Descriptions'
      : 'Candidate Screenings';

  const Icon = meterName === 'job_descriptions' ? Briefcase : Users;

  // Calculate percentage used
  const percentageUsed = unlimited
    ? 0
    : creditedUnits > 0
    ? Math.round((consumedUnits / creditedUnits) * 100)
    : 0;

  // Determine color based on usage
  const getProgressColor = () => {
    if (unlimited) return 'bg-primary';
    if (percentageUsed >= 80) return 'bg-destructive';
    if (percentageUsed >= 60) return 'bg-yellow-500';
    return 'bg-primary';
  };

  const getStatusBadge = () => {
    if (unlimited) return <Badge variant="default">Unlimited</Badge>;
    if (percentageUsed >= 80) return <Badge variant="destructive">Low</Badge>;
    if (percentageUsed >= 60) return <Badge variant="outline">Medium</Badge>;
    return <Badge variant="secondary">Good</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">{displayName}</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>
          {unlimited ? (
            'Unlimited usage available'
          ) : (
            <>
              {balance.toLocaleString()} of {creditedUnits.toLocaleString()} remaining
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {!unlimited && (
          <>
            {/* Progress Bar */}
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getProgressColor()}`}
                style={{ width: `${percentageUsed}%` }}
              />
            </div>

            {/* Usage Stats */}
            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="text-muted-foreground">
                {consumedUnits.toLocaleString()} used
              </span>
              <span className="font-medium">{percentageUsed}%</span>
            </div>
          </>
        )}

        {unlimited && (
          <div className="text-sm text-muted-foreground">
            {consumedUnits.toLocaleString()} used this period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
