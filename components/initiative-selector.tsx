'use client';

/**
 * Initiative Selector Component
 * 
 * Displays list of Initiatives and allows user to select or create one as ATS Container
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { getInitiatives, createNewInitiative, completeInitiativeSetup } from '@/lib/linear/initiatives-actions';

interface Initiative {
  id: string;
  name: string;
  description?: string;
}

export function InitiativeSelector() {
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newInitiativeName, setNewInitiativeName] = useState('');
  const [newInitiativeDescription, setNewInitiativeDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  function onComplete() {
    router.replace("/dashboard");
  }

  useEffect(() => {
    fetchInitiatives();
  }, []);

  async function fetchInitiatives() {
    try {
      setLoading(true);
      setError(null);
      
      const initiatives = await getInitiatives();
      setInitiatives(initiatives);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInitiative(e: React.FormEvent) {
    e.preventDefault();
    
    if (!newInitiativeName.trim()) {
      setError('Initiative name is required');
      return;
    }
    
    try {
      setSubmitting(true);
      setError(null);
      
      const initiative = await createNewInitiative(
        newInitiativeName,
        newInitiativeDescription || undefined
      );
      
      // Add new initiative to list and select it
      setInitiatives([...initiatives, initiative]);
      setSelectedId(initiative.id);
      setShowCreateForm(false);
      setNewInitiativeName('');
      setNewInitiativeDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetContainer() {
    if (!selectedId) {
      setError('Please select an initiative');
      return;
    }
    
    try {
      setSubmitting(true);
      setError(null);
      
      await completeInitiativeSetup(selectedId);
      
      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading initiatives...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Select ATS Container</h2>
        <p className="text-muted-foreground">
          Choose an existing Initiative or create a new one to use as your ATS Container.
          This will hold all your recruitment Projects and candidates.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded">
          {error}
        </div>
      )}

      {!showCreateForm ? (
        <>
          <div className="space-y-2">
            <h3 className="font-semibold mb-3">Existing Initiatives</h3>
            {initiatives.length === 0 ? (
              <p className="text-muted-foreground text-sm">No initiatives found in your workspace.</p>
            ) : (
              <div className="space-y-2">
                {initiatives.map((initiative) => (
                  <button
                    key={initiative.id}
                    onClick={() => setSelectedId(initiative.id)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                      selectedId === initiative.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium">{initiative.name}</div>
                    {initiative.description && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {initiative.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setShowCreateForm(true)}
              variant="outline"
            >
              Create New Initiative
            </Button>
            <Button
              onClick={handleSetContainer}
              disabled={!selectedId || submitting}
            >
              {submitting ? 'Setting...' : 'Continue'}
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={handleCreateInitiative} className="space-y-4">
          <h3 className="font-semibold">Create New Initiative</h3>
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Name *
            </label>
            <input
              id="name"
              type="text"
              value={newInitiativeName}
              onChange={(e) => setNewInitiativeName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Hiring 2024"
              required
            />
          </div>
          
          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-2">
              Description (optional)
            </label>
            <textarea
              id="description"
              value={newInitiativeDescription}
              onChange={(e) => setNewInitiativeDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Describe this initiative..."
              rows={3}
            />
          </div>
          
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewInitiativeName('');
                setNewInitiativeDescription('');
              }}
              variant="outline"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Initiative'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
