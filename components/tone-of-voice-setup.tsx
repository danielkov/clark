'use client';

/**
 * Tone of Voice Setup Component
 * 
 * Displays a button to create the Tone of Voice document if it doesn't exist
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createATSContainerToneOfVoice } from '@/lib/linear/initiatives-actions';
import { useRouter } from 'next/navigation';

export function ToneOfVoiceSetup() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleCreate() {
    try {
      setCreating(true);
      setError(null);
      
      await createATSContainerToneOfVoice();
      
      // Refresh the page to update the UI
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="border border-yellow-500 bg-yellow-50 dark:bg-yellow-950 rounded-lg p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
          Tone of Voice Document Missing
        </h3>
        <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
          Clark needs a Tone of Voice document to guide job description creation.
        </p>
      </div>
      
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      
      <Button
        onClick={handleCreate}
        disabled={creating}
        variant="default"
        size="sm"
      >
        {creating ? 'Creating...' : 'Create Tone of Voice Document'}
      </Button>
    </div>
  );
}
