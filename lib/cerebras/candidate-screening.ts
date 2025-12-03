'use server';

import { cerebras } from "./client";
import { ScreeningResult, InsufficientBalanceError } from "@/types";
import { trackAIOperation, measureDuration } from "@/lib/datadog/metrics";
import { logger } from "@/lib/datadog/logger";
import { emitAIOperationFailure } from "@/lib/datadog/events";
import { checkMeterBalance, recordUsageEvent } from "@/lib/polar/usage-meters";

const systemPrompt = `You are an expert technical recruiter and candidate screening specialist. Your task is to evaluate whether a candidate is a good fit for a specific job opening based on their CV and the job description.

## Instructions:

1. Carefully analyze the candidate's CV content, looking for:
   - Relevant work experience and years of experience
   - Technical skills and competencies
   - Educational background
   - Notable achievements and projects
   - Cultural fit indicators

2. Compare the candidate's qualifications against the job requirements:
   - Required qualifications and skills
   - Preferred qualifications
   - Experience level expectations
   - Specific technical or domain expertise

3. Determine a confidence level for the match:
   - **HIGH**: Candidate clearly meets most or all key requirements, has relevant experience, and shows strong potential for success
   - **LOW**: Candidate lacks critical requirements, has insufficient experience, or shows clear misalignment with the role
   - **AMBIGUOUS**: Candidate has some relevant qualifications but also has gaps, or the information is insufficient to make a clear determination

4. Provide specific reasoning:
   - List matched criteria with specific evidence from the CV
   - List concerns or gaps with specific examples
   - Be objective and evidence-based

## Output Format:

You must respond with a valid JSON object in the following format:

{
  "confidence": "high" | "low" | "ambiguous",
  "reasoning": "A clear explanation of your assessment",
  "matchedCriteria": ["Specific criterion 1 with evidence", "Specific criterion 2 with evidence"],
  "concerns": ["Specific concern 1", "Specific concern 2"]
}

Important: Return ONLY the JSON object, no additional text or formatting.`;

/**
 * Screen a candidate using AI to evaluate fit for a job
 * 
 * @param cvContent The candidate's CV content (from Issue description)
 * @param jobDescription The job description from the Linear Project
 * @param linearOrgId Linear organization ID for usage tracking
 * @param metadata Optional metadata to include with usage event
 * @returns Structured screening result with confidence and reasoning
 */
export async function screenCandidate(
  cvContent: string,
  jobDescription: string,
  linearOrgId: string,
  metadata?: Record<string, any>
): Promise<ScreeningResult> {
  const startTime = Date.now();
  let success = false;
  let errorType: string | undefined;

  try {
    logger.info('Starting candidate screening', {
      cvContentLength: cvContent.length,
      jobDescriptionLength: jobDescription.length,
      linearOrgId,
    });

    // Check meter balance before screening
    // Requirements: 2.3, 10.2
    const balanceCheck = await checkMeterBalance(linearOrgId, 'candidate_screenings');

    if (!balanceCheck.allowed && !balanceCheck.unlimited) {
      logger.warn('Insufficient balance for candidate screening', {
        linearOrgId,
        balance: balanceCheck.balance,
        limit: balanceCheck.limit,
      });

      throw new InsufficientBalanceError(
        `You have reached your candidate screening limit. Current balance: ${balanceCheck.balance}/${balanceCheck.limit}. Please upgrade your subscription to continue.`,
        balanceCheck.balance,
        balanceCheck.limit
      );
    }

    logger.info('Meter balance check passed', {
      linearOrgId,
      balance: balanceCheck.balance,
      unlimited: balanceCheck.unlimited,
    });

    const { result: completion, duration } = await measureDuration(() =>
      cerebras.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Job Description:\n\n${jobDescription}\n\n---\n\nCandidate CV:\n\n${cvContent}`,
          },
        ],
        model: "llama-3.3-70b",
        max_completion_tokens: 2048,
        temperature: 0.2,
        top_p: 1,
        stream: false,
        response_format: {
          type: "json_object",
        },
      })
    );

    // @ts-expect-error types don't seem to want to resolve here.
    const output = completion.choices?.[0]?.message?.content;

    if (!output) {
      throw new Error('No response from AI screening');
    }

    // Parse the JSON response
    const parsed = JSON.parse(output.trim());

    // Validate the response structure
    if (!parsed.confidence || !['high', 'low', 'ambiguous'].includes(parsed.confidence)) {
      throw new Error('Invalid confidence level in AI response');
    }

    // Map confidence to recommended state
    let recommendedState: 'Screening' | 'Declined' | 'Triage';
    switch (parsed.confidence) {
      case 'high':
        recommendedState = 'Screening';
        break;
      case 'low':
        recommendedState = 'Declined';
        break;
      case 'ambiguous':
      default:
        recommendedState = 'Triage';
        break;
    }

    success = true;

    // Track successful AI operation
    trackAIOperation({
      operation: 'candidate-screening',
      model: 'llama-3.3-70b',
      latency: duration,
      success: true,
    });

    logger.info('Candidate screening completed', {
      duration,
      confidence: parsed.confidence,
      recommendedState,
      linearOrgId,
    });

    // Record usage event after successful screening
    // Requirements: 2.4, 4.5, 10.3
    await recordUsageEvent(linearOrgId, 'candidate_screenings', {
      userId: metadata?.userId,
      resourceId: metadata?.resourceId,
      cvContentLength: cvContent.length,
      jobDescriptionLength: jobDescription.length,
      confidence: parsed.confidence,
      recommendedState,
      duration,
    });

    logger.info('Usage event recorded for candidate screening', {
      linearOrgId,
    });

    return {
      confidence: parsed.confidence,
      reasoning: parsed.reasoning || 'No reasoning provided',
      matchedCriteria: parsed.matchedCriteria || [],
      concerns: parsed.concerns || [],
      recommendedState,
    };
  } catch (error) {
    success = false;
    errorType = error instanceof Error ? error.name : 'UnknownError';

    const latency = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));

    // Track failed AI operation
    trackAIOperation({
      operation: 'candidate-screening',
      model: 'llama-3.3-70b',
      latency,
      success: false,
      errorType,
    });

    logger.error('Error screening candidate', err, {
      errorType,
      latency,
    });

    // Emit critical failure event
    emitAIOperationFailure('candidate-screening', err, {
      model: 'llama-3.3-70b',
      latency,
    });
    
    // Fallback to manual triage on error (Requirements: 4.1 - fallback for AI failures)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return {
      confidence: 'ambiguous',
      reasoning: `AI screening failed: ${errorMessage}. Manual review required.`,
      matchedCriteria: [],
      concerns: ['AI screening service error - system will default to manual triage'],
      recommendedState: 'Triage',
    };
  }
}
