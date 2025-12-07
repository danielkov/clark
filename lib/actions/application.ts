'use server';

/**
 * Server Actions for Application Submission
 * 
 * Handles job application submissions with validation
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { validateApplication, validateFile } from '@/lib/validation';
import { ApplicationResult } from '@/types';
import { createCandidateIssue } from '@/lib/linear/issues';
import { parseCV } from '@/lib/linear/cv-parser';
import { getUserFriendlyErrorMessage } from '@/lib/utils/retry';
import { logger, generateCorrelationId } from '@/lib/datadog/logger';
import { createSpan } from '@/lib/datadog/metrics';
import { checkMeterBalance } from '@/lib/polar/usage-meters';

/**
 * Submits a job application
 * 
 * @param formData Form data containing application details
 * @returns Application result with success status and any errors
 */
export async function submitApplication(
  formData: FormData
): Promise<ApplicationResult> {
  const correlationId = generateCorrelationId();
  const workflowSpan = createSpan('application_submission_workflow', {
    'workflow.name': 'application_submission',
    'correlation_id': correlationId,
  });

  try {
    // Extract form data
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const jobId = formData.get('jobId') as string;
    const linearOrg = formData.get('linearOrg') as string;
    const cvFile = formData.get('cv') as File | null;
    const coverLetterFile = formData.get('coverLetter') as File | null;

    workflowSpan.setTag('job_id', jobId);
    workflowSpan.setTag('linear_org', linearOrg);
    workflowSpan.setTag('applicant_email', email);

    // Validate application data
    const validationErrors = validateApplication({
      name,
      email,
      cvFile
    });

    // Validate CV file if present
    if (cvFile) {
      const cvFileError = validateFile(cvFile);
      if (cvFileError) {
        validationErrors.push({
          field: 'cv',
          message: cvFileError.message
        });
      }
    }

    // Validate cover letter file if present
    if (coverLetterFile) {
      const coverLetterError = validateFile(coverLetterFile);
      if (coverLetterError) {
        validationErrors.push({
          field: 'coverLetter',
          message: coverLetterError.message
        });
      }
    }

    // Return validation errors if any
    if (validationErrors.length > 0) {
      return {
        success: false,
        errors: validationErrors
      };
    }

    // Create Linear Issue for the candidate with "New" label
    // The state machine will handle processing via webhook events
    // Requirements: 3.3, 3.4, 3.5, 3.6
    const issue = await createCandidateIssue(
      linearOrg,
      jobId,
      {
        name,
        email,
        cvFile: cvFile!,
        coverLetterFile,
      }
    );
    
    workflowSpan.setTag('issue_id', issue.id);
    workflowSpan.finish();
    
    return {
      success: true,
      issueId: issue.id,
    };

  } catch (error) {
    workflowSpan.setError(error instanceof Error ? error : new Error(String(error)));
    workflowSpan.finish();
    
    logger.error('Application submission error', error instanceof Error ? error : new Error(String(error)), {
      jobId: formData.get('jobId') as string,
      linearOrg: formData.get('linearOrg') as string,
      correlationId,
    });
    
    // Provide user-friendly error message
    const errorMessage = getUserFriendlyErrorMessage(error);
    
    return {
      success: false,
      errors: [{
        field: 'submit',
        message: errorMessage || 'An unexpected error occurred while processing your application. Please try again.'
      }]
    };
  }
}
