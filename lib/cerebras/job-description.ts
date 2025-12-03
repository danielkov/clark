'use server';

import { cerebras } from "./client";
import { trackAIOperation, measureDuration } from "@/lib/datadog/metrics";
import { logger } from "@/lib/datadog/logger";
import { emitAIOperationFailure } from "@/lib/datadog/events";
import { checkMeterBalance, recordUsageEvent } from "@/lib/polar/usage-meters";
import { InsufficientBalanceError } from "@/types";

const systemPrompt = `You are an expert HR copywriter and job-description specialist. Your task is to transform a rough job description into a clear, comprehensive, and professional job posting.

You will also receive a tone of voice guide, which you must follow precisely. Adjust phrasing, style, and personality to match the guide while maintaining professionalism and clarity.

## Instructions:

1. Use the tone of voice guide as your stylistic foundation.
   - Reflect the writing style, pacing, formality level, and personality described.
   - Maintain readability and professionalism suitable for a job listing.
2. Use all information from the rough job description.
   - Do not omit key responsibilities, requirements, benefits, or contextual details.
   - If the rough input is unclear or incomplete, rewrite it to be polished, structured, and easy to understand—without adding fictional information.
3. Produce a polished, employer-ready job description that typically includes:
   - Role summary
   - Key responsibilities
   - Required qualifications
   - Preferred qualifications (if mentioned)
   - Skills and competencies
   - Company or team overview (only if provided)
   - Benefits and compensation details (only if provided)
   - Application or next-step instructions (only if provided)
4. Improve clarity, structure, and flow, but preserve the meaning and intent of the original content.
5. Do not fabricate details that were not present in the rough description or tone guide.

Output Format:

Return the final answer in clean, well-structured Markdown, formatted as a professional job description aligned to the specified tone of voice.

Ensure the structure is clear, readable, and polished, using appropriate Markdown headings and bullet lists.`

export async function enhanceJobDescription(
    original: string,
    toneOfVoice: string,
    linearOrgId: string,
    metadata?: Record<string, any>
): Promise<string | undefined> {
    const startTime = Date.now();
    let success = false;
    let errorType: string | undefined;

    try {
        logger.info('Starting job description enhancement', {
            originalLength: original.length,
            toneOfVoiceLength: toneOfVoice.length,
            linearOrgId,
        });

        // Check meter balance before generation
        // Requirements: 2.1, 10.1
        const balanceCheck = await checkMeterBalance(linearOrgId, 'job_descriptions');

        if (!balanceCheck.allowed && !balanceCheck.unlimited) {
            logger.warn('Insufficient balance for job description generation', {
                linearOrgId,
                balance: balanceCheck.balance,
                limit: balanceCheck.limit,
            });

            throw new InsufficientBalanceError(
                `You have reached your job description generation limit. Current balance: ${balanceCheck.balance}/${balanceCheck.limit}. Please upgrade your subscription to continue.`,
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
                        content: `Rough job description: ${original} --- Tone of Voice guide: ${toneOfVoice}`,
                    },
                ],
                model: "llama-3.3-70b",
                max_completion_tokens: 1024,
                temperature: 0.2,
                top_p: 1,
                stream: false,
            })
        );

        // @ts-expect-error types don't seemt to want to resolve here.
        const output = completion.choices?.[0]?.message?.content;

        if (!output) {
            throw new Error('No content generated from LLM');
        }

        success = true;

        // Track AI operation metrics
        trackAIOperation({
            operation: 'job-description',
            model: 'llama-3.3-70b',
            latency: duration,
            success: true,
        });

        logger.info('Job description enhancement completed', {
            duration,
            outputLength: output.length,
            linearOrgId,
        });

        // Record usage event after successful generation
        // Requirements: 2.2, 4.4, 10.3
        await recordUsageEvent(linearOrgId, 'job_descriptions', {
            userId: metadata?.userId,
            resourceId: metadata?.resourceId,
            originalLength: original.length,
            outputLength: output.length,
            duration,
        });

        logger.info('Usage event recorded for job description generation', {
            linearOrgId,
        });

        return output;
    } catch (error) {
        success = false;
        errorType = error instanceof Error ? error.name : 'UnknownError';

        const latency = Date.now() - startTime;
        const err = error instanceof Error ? error : new Error(String(error));

        // Track failed AI operation
        trackAIOperation({
            operation: 'job-description',
            model: 'llama-3.3-70b',
            latency,
            success: false,
            errorType,
        });

        logger.error('Error enhancing job description', err, {
            errorType,
            latency,
        });

        // Emit critical failure event
        emitAIOperationFailure('job-description', err, {
            model: 'llama-3.3-70b',
            latency,
        });

        throw error;
    }
}
