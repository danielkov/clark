/**
 * Core type definitions for the AI-enriched ATS
 */

/**
 * Custom error for insufficient usage balance
 * Thrown when a user attempts an operation that would exceed their usage limits
 */
export class InsufficientBalanceError extends Error {
  constructor(
    message: string,
    public balance: number,
    public limit: number | null
  ) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * User session data stored after authentication
 */
export interface UserSession {
  userId: string;
  workosId: string;
  linearAccessToken: string;
  linearRefreshToken: string;
  linearTokenExpiry: Date;
  atsContainerInitiativeId: string | null;
}

/**
 * Job listing derived from Linear Project
 */
export interface JobListing {
  id: string; // Linear Project ID
  title: string;
  description: string;
  content: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  isAIGenerated: boolean;
}

/**
 * Candidate application form data
 */
export interface CandidateApplication {
  name: string;
  email: string;
  cvFile: File;
  coverLetterFile?: File;
  jobId: string;
}

/**
 * AI screening result from pre-screening agent
 */
export interface ScreeningResult {
  confidence: 'high' | 'low' | 'ambiguous';
  reasoning: string;
  matchedCriteria: string[];
  concerns: string[];
  recommendedState: 'Screening' | 'Declined' | 'Triage';
}

/**
 * Linear Initiative reference
 */
export interface Initiative {
  id: string;
  name: string;
  description?: string;
}

/**
 * Validation error for form submissions
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Application submission result
 */
export interface ApplicationResult {
  success: boolean;
  issueId?: string;
  errors?: ValidationError[];
}
