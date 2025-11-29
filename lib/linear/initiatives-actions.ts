'use server';

/**
 * Server Actions for Initiative Management
 */

import { withAuth } from '@workos-inc/authkit-nextjs';
import { fetchInitiatives, createInitiative, setATSContainer, getATSContainer } from './initiatives';
import { ensureToneOfVoiceDocument, checkToneOfVoiceDocument } from './documents';

/**
 * Fetch all Initiatives from user's Linear workspace
 */
export async function getInitiatives() {
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
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!initiativeId || typeof initiativeId !== 'string') {
    throw new Error('Initiative ID is required');
  }

  // Set the ATS Container
  await setATSContainer(initiativeId);
  
  // Ensure Tone of Voice Document exists
  const toneOfVoiceDoc = await ensureToneOfVoiceDocument(initiativeId);
  
  return {
    success: true,
    toneOfVoiceDocumentId: toneOfVoiceDoc.id,
  };
}

/**
 * Check if the current ATS Container has a Tone of Voice Document
 */
export async function checkATSContainerToneOfVoice() {
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
