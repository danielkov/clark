/**
 * Example usage of JobDescriptionGenerator component
 * 
 * This file demonstrates how to integrate the JobDescriptionGenerator
 * component into a page or form where job descriptions need to be created.
 * 
 * To use this component in your application:
 * 
 * 1. Import the component and the enhanceJobDescription function:
 *    import { JobDescriptionGenerator } from '@/components/job-description-generator';
 *    import { enhanceJobDescription } from '@/lib/cerebras/job-description';
 * 
 * 2. Get the Linear organization ID from the user session
 * 
 * 3. Create a wrapper function that calls enhanceJobDescription with the org ID:
 *    const handleGenerate = async (original: string, tone: string) => {
 *      return await enhanceJobDescription(original, tone, linearOrgId, metadata);
 *    };
 * 
 * 4. Render the component:
 *    <JobDescriptionGenerator
 *      onGenerate={handleGenerate}
 *      originalText={roughJobDescription}
 *      toneOfVoice={toneOfVoiceGuide}
 *      currentTier={userTier}
 *      onSuccess={(enhanced) => {
 *        // Handle the enhanced description (e.g., save to database)
 *      }}
 *    />
 * 
 * The component will automatically:
 * - Check usage limits before generation
 * - Display the UpgradePrompt if limits are reached
 * - Show clear error messages
 * - Provide an immediate upgrade button
 * 
 * Requirements: 8.2, 8.3, 8.4
 */

'use client';

import { JobDescriptionGenerator } from '@/components/job-description-generator';
import { enhanceJobDescription } from '@/lib/cerebras/job-description';
import { useState } from 'react';

export function JobDescriptionGeneratorExample() {
  const [originalText, setOriginalText] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  
  // In a real implementation, get this from the user session
  const linearOrgId = 'example-org-id';
  const currentTier = 'free';

  const handleGenerate = async (original: string, tone: string) => {
    return await enhanceJobDescription(original, tone, linearOrgId, {
      userId: 'example-user-id',
      resourceId: 'example-resource-id',
    });
  };

  const handleSuccess = (enhancedDescription: string) => {
    console.log('Enhanced description:', enhancedDescription);
    // Save to database, update UI, etc.
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Create Job Description</h1>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Rough Job Description
          </label>
          <textarea
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            className="w-full min-h-[200px] p-3 border rounded-md"
            placeholder="Enter a rough job description..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Tone of Voice Guide
          </label>
          <textarea
            value={toneOfVoice}
            onChange={(e) => setToneOfVoice(e.target.value)}
            className="w-full min-h-[100px] p-3 border rounded-md"
            placeholder="Enter your tone of voice guide..."
          />
        </div>

        <JobDescriptionGenerator
          onGenerate={handleGenerate}
          originalText={originalText}
          toneOfVoice={toneOfVoice}
          currentTier={currentTier}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
