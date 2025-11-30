'use server';

/**
 * Server Actions for Initiative Management
 */

import { fetchInitiatives, createInitiative, setATSContainer, getATSContainer } from './initiatives';
import { ensureToneOfVoiceDocument, checkToneOfVoiceDocument } from './documents';
import { createSpan } from '@/lib/datadog/metrics';
import { logger, generateCorrelationId } from '@/lib/datadog/logger';

/**
 * Fetch all Initiatives from user's Linear workspace
 */
export async function getInitiatives() {
  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  const initiatives = await fetchInitiatives();
  
  return initiatives.map(i => ({
    id: i.id,
    name: i.name,
    description: i.description,
  }));
}

/**
 * Create a new Initiative
 */
export async function createNewInitiative(name: string, description?: string) {
  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Initiative name is required');
  }

  const initiative = await createInitiative(name.trim(), description);
  
  return {
    id: initiative.id,
    name: initiative.name,
    description: initiative.description,
  };
}

/**
 * Set an Initiative as the ATS Container
 */
export async function setInitiativeAsATSContainer(initiativeId: string) {
  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!initiativeId || typeof initiativeId !== 'string') {
    throw new Error('Initiative ID is required');
  }

  await setATSContainer(initiativeId);
  
  return { success: true };
}

/**
 * Complete Initiative Setup - Set ATS Container and create Tone of Voice Document
 */
export async function completeInitiativeSetup(initiativeId: string) {
  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!initiativeId || typeof initiativeId !== 'string') {
    throw new Error('Initiative ID is required');
  }

  const correlationId = generateCorrelationId();
  const workflowSpan = createSpan('onboarding_workflow', {
    'workflow.name': 'onboarding',
    'initiative_id': initiativeId,
    'user_id': user.id,
    'correlation_id': correlationId,
  });

  try {
    logger.info('Starting onboarding workflow', {
      initiativeId,
      userId: user.id,
      correlationId,
    });

    // Set the ATS Container
    await setATSContainer(initiativeId);
    
    // Ensure Tone of Voice Document exists
    const toneOfVoiceDoc = await ensureToneOfVoiceDocument(initiativeId);
    
    workflowSpan.setTag('tone_of_voice_doc_id', toneOfVoiceDoc.id);
    workflowSpan.finish();

    logger.info('Onboarding workflow completed', {
      initiativeId,
      toneOfVoiceDocId: toneOfVoiceDoc.id,
      correlationId,
    });
    
    return {
      success: true,
      toneOfVoiceDocumentId: toneOfVoiceDoc.id,
    };
  } catch (error) {
    workflowSpan.setError(error instanceof Error ? error : new Error(String(error)));
    workflowSpan.finish();

    logger.error('Onboarding workflow failed', error instanceof Error ? error : new Error(String(error)), {
      initiativeId,
      userId: user.id,
      correlationId,
    });

    throw error;
  }
}

/**
 * Check if the current ATS Container has a Tone of Voice Document
 */
export async function checkATSContainerToneOfVoice() {
  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  const initiativeId = await getATSContainer();
  
  if (!initiativeId) {
    return { hasToneOfVoice: false, initiativeId: null };
  }

  const doc = await checkToneOfVoiceDocument(initiativeId);
  
  return {
    hasToneOfVoice: doc !== null,
    initiativeId,
    documentId: doc?.id,
  };
}

/**
 * Create Tone of Voice Document for the current ATS Container
 */
export async function createATSContainerToneOfVoice() {
  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  const initiativeId = await getATSContainer();
  
  if (!initiativeId) {
    throw new Error('No ATS Container configured');
  }

  const doc = await ensureToneOfVoiceDocument(initiativeId);
  
  return {
    success: true,
    documentId: doc.id,
  };
}
