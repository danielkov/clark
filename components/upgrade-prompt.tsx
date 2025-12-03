/**
 * Upgrade Prompt Component
 * 
 * Displays when a user reaches their usage limit, prompting them to upgrade
 * their subscription tier. Shows clear error messaging and immediate upgrade options.
 * 
 * Requirements: 8.3
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ArrowRight, Zap } from 'lucide-react';

export interface UpgradePromptProps {
  meterName: 'job_descriptions' | 'candidate_screenings';
  currentTier?: string;
  onUpgrade?: (tierId: string) => void;
  loading?: boolean;
}

export function UpgradePrompt({
  meterName,
  currentTier = 'free',
  onUpgrade,
  loading = false,
}: UpgradePromptProps) {
  const displayName =
    meterName === 'job_descriptions'
      ? 'job descriptions'
      : 'candidate screenings';

  const getRecommendedTier = () => {
    if (currentTier === 'free') return 'pro';
    if (currentTier === 'pro') return 'enterprise';
    return 'enterprise';
  };

  const getTierDetails = (tierId: string) => {
    const tiers = {
      pro: {
        name: 'Pro',
        price: '$49',
        jobDescriptions: 50,
        candidateScreenings: 500,
      },
      enterprise: {
        name: 'Enterprise',
        price: '$199',
        jobDescriptions: 'Unlimited',
        candidateScreenings: 'Unlimited',
      },
    };
    return tiers[tierId as keyof typeof tiers];
  };

  const recommendedTier = getRecommendedTier();
  const tierDetails = getTierDetails(recommendedTier);

  return (
    <Card className="border-destructive">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-destructive/10 rounded-lg">
            <AlertCircle className="size-5 text-destructive" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-destructive">Usage Limit Reached</CardTitle>
            <CardDescription className="mt-1">
              You've used all your {displayName} for this billing period. Upgrade
              to continue using this feature.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Limitation */}
        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">Current Plan: {currentTier}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Your current plan has reached its monthly limit for {displayName}.
            Upgrade to get more capacity and unlock additional features.
          </p>
        </div>

        {/* Recommended Upgrade */}
        <div className="border border-primary/20 bg-primary/5 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="size-4 text-primary" />
            <span className="font-semibold text-primary">
              Recommended: {tierDetails.name} Plan
            </span>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium">{tierDetails.price}/month</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Job Descriptions</span>
              <span className="font-medium">{tierDetails.jobDescriptions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Candidate Screenings</span>
              <span className="font-medium">{tierDetails.candidateScreenings}</span>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          onClick={() => onUpgrade?.(recommendedTier)}
          disabled={loading}
          className="flex-1"
        >
          {loading ? 'Processing...' : `Upgrade to ${tierDetails.name}`}
          <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
