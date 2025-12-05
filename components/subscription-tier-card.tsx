/**
 * Subscription Tier Card Component
 * 
 * Displays subscription tier details with pricing, allowances, and features.
 * Used on the subscription management page to show available tiers.
 * 
 * Requirements: 1.1
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

export interface SubscriptionTierCardProps {
  tier: {
    id: string;
    name: string;
    price: number; // Price in cents
    currency: 'usd';
    description: string;
    features: string[];
  };
  currentTier?: boolean;
  onSelect?: () => void;
  loading?: boolean;
}

export function SubscriptionTierCard({
  tier,
  currentTier = false,
  onSelect,
  loading = false,
}: SubscriptionTierCardProps) {
  const formatPrice = (priceInCents: number) => {
    if (priceInCents === 0) return 'Free';
    const dollars = priceInCents / 100;
    return `$${dollars.toFixed(0)}`;
  };

  const formatAllowance = (value: number | null) => {
    if (value === null) return 'Unlimited';
    return value.toLocaleString();
  };

  return (
    <Card className={currentTier ? 'border-primary shadow-md' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{tier.name}</CardTitle>
          {currentTier && (
            <Badge variant="default">Current Plan</Badge>
          )}
        </div>
        <CardDescription>{tier.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Pricing */}
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold">{formatPrice(tier.price)}</span>
          {tier.price > 0 && (
            <span className="text-muted-foreground text-sm">/month</span>
          )}
        </div>

        {/* Features */}
        <div className="space-y-2 pt-4 border-t">
          {tier.features.map((feature, index) => (
            <div key={index} className="flex items-start gap-2">
              <Check className="size-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </CardContent>

      {onSelect && !currentTier && (
        <CardFooter>
          <Button
            onClick={onSelect}
            disabled={loading}
            className="w-full"
            variant={tier.id === 'enterprise' ? 'default' : 'outline'}
          >
            {loading ? 'Loading...' : `Select ${tier.name}`}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
