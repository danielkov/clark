'use client';

/**
 * Job Description Generator Component
 * 
 * Handles AI-powered job description generation with usage limit error handling.
 * Displays UpgradePrompt when usage limits are reached.
 * 
 * Requirements: 8.2, 8.3, 8.4
 */

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { UpgradePrompt } from '@/components/upgrade-prompt';
import { createCheckoutAction } from '@/lib/actions/subscription';
import { Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';

export interface JobDescriptionGeneratorProps {
  onGenerate: (originalText: string, toneOfVoice: string) => Promise<string | undefined>;
  originalText?: string;
  toneOfVoice?: string;
  onSuccess?: (enhancedDescription: string) => void;
  currentTier?: string;
}

export function JobDescriptionGenerator({
  onGenerate,
  originalText = '',
  toneOfVoice = '',
  onSuccess,
  currentTier = 'free',
}: JobDescriptionGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUsageLimitError, setShowUsageLimitError] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enhancedDescription, setEnhancedDescription] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setShowUsageLimitError(false);

    try {
      const result = await onGenerate(originalText, toneOfVoice);
      
      if (result) {
        setEnhancedDescription(result);
        if (onSuccess) {
          onSuccess(result);
        }
      } else {
        setError('Failed to generate job description. Please try again.');
      }
    } catch (err) {
      console.error('Job description generation error:', err);
      
      // Check if this is a usage limit error
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      if (errorMessage.includes('job description') && 
          (errorMessage.includes('limit') || errorMessage.includes('balance'))) {
        setShowUsageLimitError(true);
        setError(errorMessage);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpgrade = async (tierId: string) => {
    setIsUpgrading(true);
    try {
      const result = await createCheckoutAction(
        tierId,
        `${window.location.origin}/dashboard`,
        `${window.location.href}`
      );
      
      if (result.success && result.data?.checkoutUrl) {
        // Redirect to Polar checkout
        window.location.href = result.data.checkoutUrl;
      } else {
        setError(result.error || 'Failed to create checkout session. Please try again.');
      }
    } catch (err) {
      console.error('Upgrade error:', err);
      setError('Failed to initiate upgrade. Please try again.');
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <div className="space-y-4">
      {showUsageLimitError && (
        <UpgradePrompt
          meterName="job_descriptions"
          currentTier={currentTier}
          onUpgrade={handleUpgrade}
          loading={isUpgrading}
        />
      )}

      {error && !showUsageLimitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {enhancedDescription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              Enhanced Job Description
            </CardTitle>
            <CardDescription>
              AI-generated job description based on your input
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: enhancedDescription }} />
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        onClick={handleGenerate}
        disabled={isGenerating || isUpgrading || !originalText || !toneOfVoice}
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Generate Job Description
          </>
        )}
      </Button>
    </div>
  );
}
