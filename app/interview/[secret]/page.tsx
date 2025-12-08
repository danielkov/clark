/**
 * ElevenLabs Interview Page
 * 
 * Hosts the AI-powered screening interview using ElevenLabs Conversational AI.
 * The secret in the URL is used to securely retrieve session context.
 */

import { InterviewClient } from '@/app/interview/[secret]/interview-client';
import { getScreeningSession } from '@/lib/elevenlabs/session-secrets';
import { notFound } from 'next/navigation';

interface InterviewPageProps {
  params: Promise<{
    secret: string;
  }>;
}

export default async function InterviewPage({ params }: InterviewPageProps) {
  const { secret } = await params;
  
  // Validate secret format
  if (!secret || secret.length < 20) {
    notFound();
  }

  // Get session data to verify it exists
  const sessionData = await getScreeningSession(secret);
  
  if (!sessionData) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                AI Screening Interview
              </h1>
              <p className="text-slate-600 dark:text-slate-300">
                Welcome, {sessionData.candidateName}! Ready to chat with {sessionData.companyName}?
              </p>
            </div>
            
            <InterviewClient secret={secret} />
          </div>
        </div>
      </div>
    </div>
  );
}
