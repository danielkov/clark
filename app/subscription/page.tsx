/**
 * Subscription Management Page
 * 
 * Displays available subscription tiers, current subscription status,
 * and allows users to subscribe, upgrade, or cancel their subscription.
 * 
 * Requirements: 1.1, 1.2, 1.5
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SubscriptionTierCard } from '@/components/subscription-tier-card';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import {
  getTiersAction,
  getSubscriptionAction,
  createCheckoutAction,
  cancelSubscriptionAction,
} from '@/lib/actions/subscription';
import { StoredSubscription } from '@/types/polar';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  currency: 'usd';
  allowances: {
    jobDescriptions: number | null;
    candidateScreenings: number | null;
  };
  polarProductId: string;
  description: string;
  features: string[];
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<StoredSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Load tiers and current subscription
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Load tiers
        const tiersResult = await getTiersAction();
        if (!tiersResult.success || !tiersResult.data) {
          throw new Error(tiersResult.error || 'Failed to load subscription tiers');
        }
        setTiers(tiersResult.data);

        // Load current subscription
        const subscriptionResult = await getSubscriptionAction();
        if (!subscriptionResult.success) {
          throw new Error(subscriptionResult.error || 'Failed to load subscription');
        }
        setCurrentSubscription(subscriptionResult.data || null);
      } catch (err) {
        console.error('Failed to load subscription data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load subscription data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Get current tier ID from subscription
  const getCurrentTierId = (): string => {
    if (!currentSubscription) return 'free';

    // Map product ID to tier ID
    const tier = tiers.find((t) => t.polarProductId === currentSubscription.productId);
    return tier?.id || 'free';
  };

  // Handle tier selection
  const handleSelectTier = async (tierId: string) => {
    try {
      setCheckoutLoading(tierId);
      setError(null);

      // Create checkout session
      const successUrl = `${window.location.origin}/dashboard?subscription=success`;
      const cancelUrl = `${window.location.origin}/subscription?subscription=cancelled`;

      const result = await createCheckoutAction(tierId, successUrl, cancelUrl);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to create checkout session');
      }

      // Redirect to Polar checkout
      window.location.href = result.data.checkoutUrl;
    } catch (err) {
      console.error('Failed to create checkout:', err);
      setError(err instanceof Error ? err.message : 'Failed to create checkout session');
      setCheckoutLoading(null);
    }
  };

  // Handle subscription cancellation
  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? Your access will continue until the end of the current billing period.')) {
      return;
    }

    try {
      setCancelLoading(true);
      setError(null);

      const result = await cancelSubscriptionAction();

      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel subscription');
      }

      // Reload subscription data
      const subscriptionResult = await getSubscriptionAction();
      if (subscriptionResult.success) {
        setCurrentSubscription(subscriptionResult.data || null);
      }

      alert('Your subscription has been cancelled and will remain active until the end of the current billing period.');
    } catch (err) {
      console.error('Failed to cancel subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  };

  // Format date for display
  const formatDate = (date: Date | null): string => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  const currentTierId = getCurrentTierId();
  const currentTier = tiers.find((t) => t.id === currentTierId);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard')}
              className="mb-2"
            >
              <ArrowLeft className="size-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold">Subscription Management</h1>
            <p className="text-muted-foreground mt-2">
              Choose the plan that fits your hiring needs
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Error</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Subscription Status */}
        {currentSubscription && currentSubscription.status === 'active' ? (
          <Card>
            <CardHeader>
              <CardTitle>Current Subscription</CardTitle>
              <CardDescription>Your active subscription details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Plan</p>
                  <p className="text-lg font-semibold">{currentTier?.name || 'Unknown'}</p>
                </div>
                <Badge variant={currentSubscription.cancelAtPeriodEnd ? 'destructive' : 'default'}>
                  {currentSubscription.cancelAtPeriodEnd ? 'Cancelling' : 'Active'}
                </Badge>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Current Period Start</p>
                  <p className="font-medium">{formatDate(currentSubscription.currentPeriodStart)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Period End</p>
                  <p className="font-medium">{formatDate(currentSubscription.currentPeriodEnd)}</p>
                </div>
              </div>

              {currentSubscription.cancelAtPeriodEnd && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    Your subscription is scheduled to cancel on{' '}
                    <span className="font-semibold">
                      {formatDate(currentSubscription.currentPeriodEnd)}
                    </span>
                    . You will retain access until then.
                  </p>
                </div>
              )}

              {!currentSubscription.cancelAtPeriodEnd && currentTierId !== 'free' && (
                <Button
                  variant="destructive"
                  onClick={handleCancelSubscription}
                  disabled={cancelLoading}
                  className="w-full"
                >
                  {cancelLoading ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    'Cancel Subscription'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No Active Subscription</CardTitle>
              <CardDescription>Choose a plan below to get started</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                You're currently on the Free tier with limited access. Select a paid plan below to unlock more features and higher usage limits.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Subscription Tiers */}
        <div>
          <h2 className="text-2xl font-semibold mb-6">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tiers.map((tier) => (
              <SubscriptionTierCard
                key={tier.id}
                tier={tier}
                currentTier={tier.id === currentTierId}
                onSelect={
                  tier.id !== 'free' && tier.id !== currentTierId
                    ? () => handleSelectTier(tier.id)
                    : undefined
                }
                loading={checkoutLoading === tier.id}
              />
            ))}
          </div>
        </div>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle>Billing Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              • All subscriptions are billed monthly and renew automatically
            </p>
            <p>
              • Usage allowances reset at the beginning of each billing cycle
            </p>
            <p>
              • You can upgrade or downgrade your plan at any time
            </p>
            <p>
              • Cancellations take effect at the end of the current billing period
            </p>
            <p>
              • No overage charges - operations are blocked when limits are reached
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
