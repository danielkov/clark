/**
 * Benefit Check Helper Functions
 * 
 * Provides convenience wrapper functions for checking subscription benefits
 * for email communication and AI screening features.
 * 
 * These functions wrap the generic hasBenefit() function from subscription.ts
 * with feature-specific benefit IDs and logging.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { config } from '../config';
import { logger } from '../datadog/logger';
import { hasBenefit } from './subscription';

/**
 * Check if organization has email communication benefit
 * Requirements: 9.1, 9.3, 9.4
 * 
 * This benefit gates access to:
 * - Confirmation emails on application submission
 * - Comment-to-email functionality
 * - Rejection emails
 * 
 * @param linearOrgId - Linear organization ID
 * @returns True if organization has email communication benefit, false otherwise
 */
export async function checkEmailCommunicationBenefit(
  linearOrgId: string
): Promise<boolean> {
  const benefitId = config.polar.benefits.emailCommunication;
  
  if (!benefitId) {
    logger.error('Email communication benefit ID not configured', new Error('Missing POLAR_EMAIL_COMMUNICATION_BENEFIT_ID'), {
      linearOrgId,
    });
    return false;
  }
  
  logger.info('Checking email communication benefit', {
    linearOrgId,
    benefitId,
  });
  
  // Use the existing hasBenefit function which handles errors gracefully
  const hasEmailBenefit = await hasBenefit(linearOrgId, benefitId);
  
  logger.info(
    hasEmailBenefit 
      ? 'Organization has email communication benefit' 
      : 'Organization does not have email communication benefit',
    {
      linearOrgId,
      benefitId,
      hasEmailBenefit,
    }
  );
  
  return hasEmailBenefit;
}

/**
 * Check if organization has AI screening benefit
 * Requirements: 9.2, 9.3, 9.4
 * 
 * This benefit gates access to:
 * - AI screening invitations after pre-screening
 * - ElevenLabs agent session creation
 * - Transcript evaluation
 * 
 * @param linearOrgId - Linear organization ID
 * @returns True if organization has AI screening benefit, false otherwise
 */
export async function checkAIScreeningBenefit(
  linearOrgId: string
): Promise<boolean> {
  const benefitId = config.polar.benefits.aiScreening;
  
  if (!benefitId) {
    logger.error('AI screening benefit ID not configured', new Error('Missing POLAR_AI_SCREENING_BENEFIT_ID'), {
      linearOrgId,
    });
    return false;
  }
  
  logger.info('Checking AI screening benefit', {
    linearOrgId,
    benefitId,
  });
  
  // Use the existing hasBenefit function which handles errors gracefully
  const hasAIBenefit = await hasBenefit(linearOrgId, benefitId);
  
  logger.info(
    hasAIBenefit 
      ? 'Organization has AI screening benefit' 
      : 'Organization does not have AI screening benefit',
    {
      linearOrgId,
      benefitId,
      hasAIBenefit,
    }
  );
  
  return hasAIBenefit;
}
