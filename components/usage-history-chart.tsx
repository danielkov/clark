/**
 * Usage History Chart Component
 * 
 * Visualizes usage over time by meter type with consumption statistics.
 * Displays a simple bar chart representation of usage for each meter.
 * 
 * Requirements: 3.1
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Users, TrendingUp } from 'lucide-react';

export interface UsageHistoryEntry {
  meterName: 'job_descriptions' | 'candidate_screenings';
  consumedUnits: number;
  creditedUnits: number;
  balance: number;
  unlimited: boolean;
  percentageUsed: number;
}

export interface UsageHistoryChartProps {
  entries: UsageHistoryEntry[];
  periodLabel?: string;
}

export function UsageHistoryChart({
  entries,
  periodLabel = 'Current Billing Period',
}: UsageHistoryChartProps) {
  const getMeterIcon = (meterName: string) => {
    return meterName === 'job_descriptions' ? Briefcase : Users;
  };

  const getMeterDisplayName = (meterName: string) => {
    return meterName === 'job_descriptions'
      ? 'Job Descriptions'
      : 'Candidate Screenings';
  };

  const getUsageColor = (percentageUsed: number, unlimited: boolean) => {
    if (unlimited) return 'bg-primary';
    if (percentageUsed >= 80) return 'bg-destructive';
    if (percentageUsed >= 60) return 'bg-yellow-500';
    return 'bg-primary';
  };

  const getTrendBadge = (percentageUsed: number, unlimited: boolean) => {
    if (unlimited) return <Badge variant="default">Unlimited</Badge>;
    if (percentageUsed >= 80) return <Badge variant="destructive">High Usage</Badge>;
    if (percentageUsed >= 60) return <Badge variant="outline">Moderate</Badge>;
    return <Badge variant="secondary">Low Usage</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-muted-foreground" />
            <CardTitle>Usage Overview</CardTitle>
          </div>
        </div>
        <CardDescription>{periodLabel}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No usage data available</p>
          </div>
        ) : (
          entries.map((entry) => {
            const Icon = getMeterIcon(entry.meterName);
            const displayName = getMeterDisplayName(entry.meterName);
            const usageColor = getUsageColor(entry.percentageUsed, entry.unlimited);

            return (
              <div key={entry.meterName} className="space-y-3">
                {/* Meter Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{displayName}</span>
                  </div>
                  {getTrendBadge(entry.percentageUsed, entry.unlimited)}
                </div>

                {/* Usage Bar */}
                {!entry.unlimited && (
                  <div className="space-y-2">
                    <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${usageColor}`}
                        style={{ width: `${entry.percentageUsed}%` }}
                      />
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {entry.consumedUnits.toLocaleString()} /{' '}
                        {entry.creditedUnits.toLocaleString()} used
                      </span>
                      <span className="font-medium">{entry.percentageUsed}%</span>
                    </div>
                  </div>
                )}

                {entry.unlimited && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {entry.consumedUnits.toLocaleString()} used
                    </span>
                    <span className="font-medium text-primary">Unlimited</span>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Summary Stats */}
        {entries.length > 0 && (
          <div className="pt-4 border-t space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Operations</span>
              <span className="font-medium">
                {entries
                  .reduce((sum, entry) => sum + entry.consumedUnits, 0)
                  .toLocaleString()}
              </span>
            </div>
            {entries.some((e) => !e.unlimited) && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Average Usage</span>
                <span className="font-medium">
                  {Math.round(
                    entries
                      .filter((e) => !e.unlimited)
                      .reduce((sum, entry) => sum + entry.percentageUsed, 0) /
                      entries.filter((e) => !e.unlimited).length
                  )}
                  %
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
