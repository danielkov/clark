import { Button } from "@/components/ui/button";
import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { hasLinearConnected, getLinearClient } from "@/lib/linear/client";
import { hasATSContainer, getATSContainer } from "@/lib/linear/initiatives";
import { checkATSContainerToneOfVoice } from "@/lib/linear/initiatives-actions";
import { ToneOfVoiceSetup } from "@/components/tone-of-voice-setup";
import { RedisTokenStatus } from "@/components/redis-token-status";
import { MeterBalanceWidget } from "@/components/meter-balance-widget";
import { UsageLimitWarning } from "@/components/usage-limit-warning";
import { getMetersAction } from "@/lib/actions/usage";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const { user } = await withAuth({ ensureSignedIn: true });

  // Check if Linear is connected
  const linearConnected = await hasLinearConnected();

  if (!linearConnected) {
    redirect("/api/linear/authorize");
  }

  // Check if onboarding is complete
  let hasContainer = false;
  let onboardingError = null;
  try {
    hasContainer = await hasATSContainer();
  } catch (error) {
    console.error("Failed to check ATS container:", error);
    onboardingError = error instanceof Error ? error.message : "Unknown error";
  }

  if (!hasContainer && !onboardingError) {
    redirect("/onboarding");
  }

  // Check if Tone of Voice document exists
  let hasToneOfVoice = false;
  let toneOfVoiceError = null;
  try {
    const result = await checkATSContainerToneOfVoice();
    hasToneOfVoice = result.hasToneOfVoice;
  } catch (error) {
    console.error("Failed to check Tone of Voice:", error);
    toneOfVoiceError = error instanceof Error ? error.message : "Unknown error";
  }

  // Get Linear organization info and check Redis config status
  let organization = null;
  let configSaved = false;
  let configExpired = false;
  let linearError = null;
  let initiativeId = null;
  let initiativeUrl = null;
  try {
    const client = await getLinearClient();
    organization = await client.organization;

    const { checkRedisConfigStatus } = await import(
      "@/lib/linear/redis-actions"
    );
    const configStatus = await checkRedisConfigStatus(organization.name);
    configSaved = configStatus.hasConfig;
    configExpired = configStatus.isExpired;

    // Get ATS Container Initiative ID and construct URL
    initiativeId = await getATSContainer();
    if (initiativeId) {
      const initiative = await client.initiative(initiativeId);
      initiativeUrl = initiative?.url;
    }
  } catch (error) {
    console.error("Failed to fetch Linear organization:", error);
    linearError = error instanceof Error ? error.message : "Unknown error";
  }

  // Get meter balances for usage tracking
  let meterBalances = null;
  let metersError = null;
  try {
    const metersResult = await getMetersAction();
    if (metersResult.success && metersResult.data) {
      meterBalances = metersResult.data;
    } else {
      metersError = metersResult.error || "Failed to load usage data";
    }
  } catch (error) {
    console.error("Failed to fetch meter balances:", error);
    metersError = error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Welcome {user.firstName}!</h1>
          <form
            action={async function signout() {
              "use server";
              await signOut();
            }}
          >
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>

        {linearError && (
          <div className="border border-yellow-500 bg-yellow-50 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 mb-1">
              Linear Connection Issue
            </h3>
            <p className="text-sm text-yellow-700">
              Unable to fetch Linear organization details. Some features may be
              limited.
            </p>
          </div>
        )}

        {onboardingError && (
          <div className="border border-yellow-500 bg-yellow-50 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 mb-1">
              Setup Status Unavailable
            </h3>
            <p className="text-sm text-yellow-700">
              Unable to verify onboarding status. Please try refreshing the
              page.
            </p>
          </div>
        )}

        {!hasToneOfVoice && !toneOfVoiceError && <ToneOfVoiceSetup />}

        {toneOfVoiceError && (
          <div className="border border-yellow-500 bg-yellow-50 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 mb-1">
              Tone of Voice Status Unavailable
            </h3>
            <p className="text-sm text-yellow-700">
              Unable to check Tone of Voice document status.
            </p>
          </div>
        )}

        {organization && (
          <RedisTokenStatus
            initialHasConfig={configSaved}
            initialIsExpired={configExpired}
            orgId={organization.id}
            orgName={organization.name}
          />
        )}

        <div className="border rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Linear Integration</h2>
            {organization ? (
              <p className="text-muted-foreground mb-4">
                Connected to:{" "}
                <span className="font-medium">{organization.name}</span>
              </p>
            ) : (
              <p className="text-muted-foreground mb-4">
                Connected (organization details unavailable)
              </p>
            )}
            {initiativeUrl && (
              <a
                href={initiativeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                View ATS Initiative in Linear
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          <form
            action={async function disconnect() {
              "use server";
              const { disconnectLinear } = await import("@/lib/linear/actions");
              await disconnectLinear();
              redirect("/dashboard");
            }}
          >
            <Button type="submit" variant="destructive">
              Disconnect Linear
            </Button>
          </form>
        </div>

        {/* Usage Meters Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Usage & Billing</h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/subscription">Manage Subscription</Link>
            </Button>
          </div>

          {meterBalances && meterBalances.length > 0 ? (
            <>
              {/* Display usage warnings for low balances */}
              {meterBalances.map((meter) => {
                const percentageRemaining = meter.unlimited
                  ? 100
                  : meter.creditedUnits > 0
                  ? Math.round((meter.balance / meter.creditedUnits) * 100)
                  : 0;

                // Show warning if balance is below 20%
                if (!meter.unlimited && percentageRemaining < 20) {
                  return (
                    <UsageLimitWarning
                      key={meter.meterName}
                      meterName={meter.meterName}
                      balance={meter.balance}
                      creditedUnits={meter.creditedUnits}
                    />
                  );
                }
                return null;
              })}

              {/* Meter Balance Widgets Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                {meterBalances.map((meter) => (
                  <MeterBalanceWidget
                    key={meter.meterName}
                    meterName={meter.meterName}
                    balance={meter.balance}
                    consumedUnits={meter.consumedUnits}
                    creditedUnits={meter.creditedUnits}
                    unlimited={meter.unlimited}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="border rounded-lg p-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Get Started with a Subscription</h3>
                <p className="text-sm text-muted-foreground">
                  Subscribe to unlock AI-powered job descriptions and candidate screenings.
                  Choose a plan that fits your hiring needs.
                </p>
              </div>
              <Button asChild>
                <Link href="/subscription">View Plans & Subscribe</Link>
              </Button>
            </div>
          )}

          {metersError && (
            <div className="border border-yellow-500 bg-yellow-50 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 mb-1">
                Usage Data Unavailable
              </h3>
              <p className="text-sm text-yellow-700">
                Unable to load usage meter data. You can still view and manage your subscription.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/subscription">Manage Subscription</Link>
              </Button>
            </div>
          )}
        </div>

        {!linearError && !onboardingError && (
          <div className="border rounded-lg p-6">
            <p className="text-muted-foreground">
              Clark is ready to use. Start creating job descriptions and
              managing candidates.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
