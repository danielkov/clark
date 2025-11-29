/**
 * Linear Document Management
 * 
 * Handles creation and management of Linear Documents for Tone of Voice guides
 */

import { getLinearClient } from './client';
import { Document } from '@linear/sdk';

const TONE_OF_VOICE_TITLE = 'Tone of Voice Guide';
const DEFAULT_TONE_OF_VOICE_CONTENT = `# Tone of Voice Guide

This document defines the communication style and tone for all job descriptions in our organization.

## Voice Characteristics

- **Professional yet approachable**: We maintain professionalism while being warm and welcoming
- **Clear and concise**: We value clarity and avoid jargon where possible
- **Inclusive**: We use inclusive language that welcomes candidates from all backgrounds
- **Authentic**: We represent our company culture honestly and transparently

## Writing Guidelines

### Do's
- Use active voice and action-oriented language
- Be specific about responsibilities and requirements
- Highlight growth opportunities and learning potential
- Emphasize team culture and values
- Use "you" to address candidates directly

### Don'ts
- Avoid corporate jargon and buzzwords
- Don't use discriminatory or exclusionary language
- Avoid unrealistic requirements or "unicorn" job descriptions
- Don't oversell or make promises we can't keep

## Example Phrases

**Instead of**: "Rockstar developer needed"
**Use**: "We're looking for an experienced developer who..."

**Instead of**: "Must have 10+ years experience"
**Use**: "We value relevant experience, typically 5+ years in..."

**Instead of**: "Fast-paced environment"
**Use**: "We work collaboratively to meet ambitious goals while maintaining work-life balance"

---

*This guide should be customized to reflect your organization's unique voice and culture.*
`;

/**
 * Check if a Tone of Voice Document exists in the given Initiative
 */
export async function checkToneOfVoiceDocument(initiativeId: string): Promise<Document | null> {
  const client = await getLinearClient();
  
  // Fetch the Initiative with its documents
  const initiative = await client.initiative(initiativeId);
  
  if (!initiative) {
    throw new Error('Initiative not found');
  }
  
  // Get all documents in the initiative
  const documents = await initiative.documents();
  
  // Look for a document with the Tone of Voice title
  const toneOfVoiceDoc = documents.nodes.find(
    doc => doc.title === TONE_OF_VOICE_TITLE
  );
  
  return toneOfVoiceDoc || null;
}

/**
 * Create a default Tone of Voice Document in the given Initiative
 */
export async function createToneOfVoiceDocument(initiativeId: string): Promise<Document> {
  const client = await getLinearClient();
  
  // Verify the Initiative exists
  const initiative = await client.initiative(initiativeId);
  
  if (!initiative) {
    throw new Error('Initiative not found');
  }
  
  // Create the document
  const payload = await client.createDocument({
    title: TONE_OF_VOICE_TITLE,
    content: DEFAULT_TONE_OF_VOICE_CONTENT,
    initiativeId,
  });
  
  if (!payload.success || !payload.document) {
    throw new Error('Failed to create Tone of Voice Document');
  }
  
  return payload.document;
}

/**
 * Ensure a Tone of Voice Document exists in the Initiative
 * Creates one if it doesn't exist, returns existing one if it does
 */
export async function ensureToneOfVoiceDocument(initiativeId: string): Promise<Document> {
  // Check if document already exists
  const existingDoc = await checkToneOfVoiceDocument(initiativeId);
  
  if (existingDoc) {
    return existingDoc;
  }
  
  // Create new document if it doesn't exist
  return await createToneOfVoiceDocument(initiativeId);
}

/**
 * Get the Tone of Voice Document content for an Initiative
 */
export async function getToneOfVoiceContent(initiativeId: string): Promise<string> {
  const doc = await checkToneOfVoiceDocument(initiativeId);
  
  if (!doc) {
    throw new Error('Tone of Voice Document not found');
  }
  
  return doc.content || '';
}
