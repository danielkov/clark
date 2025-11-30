"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { saveOrgConfigToRedis } from "@/lib/linear/redis-actions";
import Link from "next/link";

interface RedisTokenStatusProps {
  initialHasConfig: boolean;
  initialIsExpired: boolean;
  orgId: string;
  orgName: string;
}

export function RedisTokenStatus({ initialHasConfig, initialIsExpired, orgId, orgName }: RedisTokenStatusProps) {
  const [hasConfig, setHasConfig] = useState(initialHasConfig);
  const [isExpired, setIsExpired] = useState(initialIsExpired);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveConfig = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await saveOrgConfigToRedis();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save configuration');
      }

      setHasConfig(true);
      setIsExpired(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const needsSync = !hasConfig || isExpired;
  const statusColor = needsSync ? 'bg-yellow-500' : 'bg-green-500';
  const statusText = isExpired 
    ? 'Configuration Expired' 
    : hasConfig 
      ? 'Configuration Synced' 
      : 'Configuration Not Synced';
  const statusDescription = isExpired
    ? 'Your Redis credentials have expired. Re-sync to update with fresh credentials.'
    : hasConfig 
      ? <>Your organization configuration is stored in Redis. Public job board is accessible at <Link className="underline" href={`/jobs/${orgName}`}>/jobs/{orgName}</Link></>
      : 'Sync your organization configuration to Redis to enable public job board access';

  return (
    <div className="border rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Public Job Board Access</h2>
      
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`mt-1 w-2 h-2 rounded-full ${statusColor}`} />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {statusText}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {statusDescription}
            </p>
          </div>
        </div>

        {needsSync && (
          <Button 
            onClick={handleSaveConfig} 
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Syncing...' : isExpired ? 'Re-sync Configuration' : 'Sync Configuration to Redis'}
          </Button>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="text-xs text-muted-foreground pt-2 border-t">
          <p><strong>Organization:</strong> {orgName}</p>
          <p><strong>Org ID:</strong> {orgId}</p>
        </div>
      </div>
    </div>
  );
}
