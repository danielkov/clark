import { Button } from "@/components/ui/button";
import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { hasLinearConnected, getLinearClient } from "@/lib/linear/client";
import { hasATSContainer } from "@/lib/linear/initiatives";
import { checkATSContainerToneOfVoice } from "@/lib/linear/initiatives-actions";
import { ToneOfVoiceSetup } from "@/components/tone-of-voice-setup";
import { RedisTokenStatus } from "@/components/redis-token-status";
import { hasOrgConfig } from "@/lib/redis";

export default async function DashboardPage() {
    const { user } = await withAuth({ ensureSignedIn: true });

    // Check if Linear is connected
    const linearConnected = await hasLinearConnected();
    
    if (!linearConnected) {
        redirect('/api/linear/authorize');
    }

    // Check if onboarding is complete
    let hasContainer = false;
    let onboardingError = null;
    try {
        hasContainer = await hasATSContainer();
    } catch (error) {
        console.error('Failed to check ATS container:', error);
        onboardingError = error instanceof Error ? error.message : 'Unknown error';
    }
    
    if (!hasContainer && !onboardingError) {
        redirect('/onboarding');
    }

    // Check if Tone of Voice document exists
    let hasToneOfVoice = false;
    let toneOfVoiceError = null;
    try {
        const result = await checkATSContainerToneOfVoice();
        hasToneOfVoice = result.hasToneOfVoice;
    } catch (error) {
        console.error('Failed to check Tone of Voice:', error);
        toneOfVoiceError = error instanceof Error ? error.message : 'Unknown error';
    }

    // Get Linear organization info and check Redis config status
    let organization = null;
    let configSaved = false;
    let configExpired = false;
    let linearError = null;
    try {
        const client = await getLinearClient();
        organization = await client.organization;
        
        const { checkRedisConfigStatus } = await import("@/lib/linear/redis-actions");
        const configStatus = await checkRedisConfigStatus(organization.name);
        configSaved = configStatus.hasConfig;
        configExpired = configStatus.isExpired;
    } catch (error) {
        console.error('Failed to fetch Linear organization:', error);
        linearError = error instanceof Error ? error.message : 'Unknown error';
    }

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold">Welcome {user.firstName}!</h1>
                    <form action={async function signout() {
                        "use server";
                        await signOut();
                    }}>
                        <Button type="submit" variant="outline">Sign out</Button>
                    </form>
                </div>

                {linearError && (
                    <div className="border border-yellow-500 bg-yellow-50 rounded-lg p-4">
                        <h3 className="font-semibold text-yellow-800 mb-1">Linear Connection Issue</h3>
                        <p className="text-sm text-yellow-700">
                            Unable to fetch Linear organization details. Some features may be limited.
                        </p>
                    </div>
                )}

                {onboardingError && (
                    <div className="border border-yellow-500 bg-yellow-50 rounded-lg p-4">
                        <h3 className="font-semibold text-yellow-800 mb-1">Setup Status Unavailable</h3>
                        <p className="text-sm text-yellow-700">
                            Unable to verify onboarding status. Please try refreshing the page.
                        </p>
                    </div>
                )}

                {!hasToneOfVoice && !toneOfVoiceError && <ToneOfVoiceSetup />}

                {toneOfVoiceError && (
                    <div className="border border-yellow-500 bg-yellow-50 rounded-lg p-4">
                        <h3 className="font-semibold text-yellow-800 mb-1">Tone of Voice Status Unavailable</h3>
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
                                Connected to: <span className="font-medium">{organization.name}</span>
                            </p>
                        ) : (
                            <p className="text-muted-foreground mb-4">
                                Connected (organization details unavailable)
                            </p>
                        )}
                    </div>
                    <form action={async function disconnect() {
                        "use server";
                        const { disconnectLinear } = await import("@/lib/linear/actions");
                        await disconnectLinear();
                        redirect('/dashboard');
                    }}>
                        <Button type="submit" variant="destructive">
                            Disconnect Linear
                        </Button>
                    </form>
                </div>

                {!linearError && !onboardingError && (
                    <div className="border rounded-lg p-6">
                        <p className="text-muted-foreground">
                            Your ATS is ready to use. Start creating job descriptions and managing candidates.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}