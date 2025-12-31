import Link from "next/link";

interface RedisTokenStatusProps {
  initialHasConfig: boolean;
  initialIsExpired: boolean;
  orgId: string;
  orgSlug: string;
}

export function RedisTokenStatus({
  initialHasConfig,
  initialIsExpired,
  orgId,
  orgSlug,
}: RedisTokenStatusProps) {
  const hasIssue = !initialHasConfig || initialIsExpired;
  const statusColor = hasIssue ? "bg-yellow-500" : "bg-green-500";
  const statusText = initialIsExpired
    ? "Token Expired"
    : initialHasConfig
    ? "Active"
    : "Not Configured";
  const statusDescription = initialIsExpired ? (
    "Your Linear token has expired. Please disconnect and reconnect Linear to refresh."
  ) : initialHasConfig ? (
    <>
      Public job board is accessible at{" "}
      <Link className="underline" href={`/jobs/${orgSlug}`}>
        /jobs/{orgSlug}
      </Link>
    </>
  ) : (
    "Please reconnect Linear to enable public job board access."
  );

  return (
    <div className="border rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Public Job Board Access</h2>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`mt-1 w-2 h-2 rounded-full ${statusColor}`} />
          <div className="flex-1">
            <p className="text-sm font-medium">{statusText}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {statusDescription}
            </p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground pt-2 border-t">
          <p>
            <strong>Organization:</strong> {orgSlug}
          </p>
          <p>
            <strong>Org ID:</strong> {orgId}
          </p>
        </div>
      </div>
    </div>
  );
}
