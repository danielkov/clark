'use client';

/**
 * ElevenLabs Interview Client Component
 * 
 * Handles the client-side ElevenLabs conversation using @11labs/react.
 * This component manages the conversation state and UI.
 */

import { useEffect, useState } from 'react';
import { useConversation } from '@11labs/react';
import { getInterviewSession, startInterviewSession, processInterviewCompletion } from '@/lib/elevenlabs/interview-actions';

interface InterviewClientProps {
  secret: string;
}

interface SessionData {
  candidateName: string;
  companyName: string;
  jobDescription: string;
  candidateApplication: string;
  conversationPointers: string;
}

export function InterviewClient({ secret }: InterviewClientProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isSessionStarted, setIsSessionStarted] = useState(false);

  // Initialize ElevenLabs conversation hook
  const conversation = useConversation({
    onConnect: () => {
      console.log('Connected to ElevenLabs');
    },
    onDisconnect: async () => {
      console.log('Disconnected from ElevenLabs, processing interview completion...');
      try {
        const result = await processInterviewCompletion(secret);
        if (!result.success) {
          console.error('Failed to process interview completion:', result.error);
        } else {
          console.log('Interview completion processed successfully');
        }
      } catch (err) {
        console.error('Error processing interview completion:', err);
      }
    },
    onMessage: (message) => {
      if (
        message.role === 'agent' &&
        message.message.includes('[END_INTERVIEW]')
      ) {
        setTimeout(() => {
          conversation.endSession();
        }, 1500); // allow TTS to finish
      }
    },
    onError: (error: any) => {
      console.error('ElevenLabs error:', error);
      setError(error?.message || 'Conversation error occurred');
    },
  });

  useEffect(() => {
    async function initializeSession() {
      try {
        setIsLoading(true);
        
        // Get the interview session and signed URL
        const response = await getInterviewSession(secret);
        
        if (!response.success || !response.signedUrl) {
          setError(response.error || 'Failed to load interview session');
          setIsLoading(false);
          return;
        }
        
        setSignedUrl(response.signedUrl);
        
        // Store session data for dynamic variables
        if (response.candidateName && response.companyName) {
          setSessionData({
            candidateName: response.candidateName,
            companyName: response.companyName,
            jobDescription: response.jobDescription || '',
            candidateApplication: response.candidateApplication || '',
            conversationPointers: response.conversationPointers || '',
          });
        }
        
        setIsLoading(false);
      } catch (err) {
        setError('Failed to initialize interview session');
        setIsLoading(false);
      }
    }
    
    initializeSession();
  }, [secret]);

  const handleStartConversation = async () => {
    if (!signedUrl || !sessionData) return;
    
    try {
      // Start the ElevenLabs session with the signed URL and dynamic variables
      const conversationId = await conversation.startSession({
        signedUrl: signedUrl,
        // Pass dynamic variables to the agent
        // These will be injected into the agent's system prompt and first message
        dynamicVariables: {
          company_name: sessionData.companyName,
          candidate_name: sessionData.candidateName,
          job_description: sessionData.jobDescription,
          job_application: sessionData.candidateApplication,
          conversation_pointers: sessionData.conversationPointers,
        },
      });
      
      console.log('Conversation started with ID:', conversationId);
      
      // Associate the conversation ID with our session in Redis
      const result = await startInterviewSession(secret, conversationId);
      
      if (!result.success) {
        console.error('Failed to associate conversation ID:', result.error);
        setError('Failed to start interview session');
        return;
      }
      
      setIsSessionStarted(true);
    } catch (err) {
      console.error('Failed to start conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
    }
  };

  const handleEndConversation = async () => {
    try {
      await conversation.endSession();
      setIsSessionStarted(false);
    } catch (err) {
      console.error('Failed to end conversation:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-slate-600 dark:text-slate-300">Loading interview session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
          Error Loading Interview
        </h2>
        <p className="text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  const statusText = conversation.status === 'connected' ? 'Connected' :
                     conversation.status === 'connecting' ? 'Connecting...' :
                     conversation.status === 'disconnected' ? 'Disconnected' : 'Ready';

  return (
    <div className="space-y-6">
      {!isSessionStarted && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Before You Begin
          </h2>
          <ul className="list-disc list-inside space-y-2 text-blue-800 dark:text-blue-200">
            <li>Make sure you're in a quiet environment</li>
            <li>Check that your microphone is working</li>
            <li>The interview typically takes 10-15 minutes</li>
            <li>Speak clearly and naturally</li>
          </ul>
        </div>
      )}

      <div className="flex flex-col items-center space-y-4">
        <div className="text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
            Status: <span className="font-semibold">{statusText}</span>
          </p>
          {conversation.isSpeaking && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              🎤 Speaking...
            </p>
          )}
        </div>

        {!isSessionStarted && (
          <button
            onClick={handleStartConversation}
            disabled={!signedUrl || conversation.status === 'connecting'}
            className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {conversation.status === 'connecting' ? 'Connecting...' : 'Start Interview'}
          </button>
        )}

        {isSessionStarted && conversation.status === 'connected' && (
          <div className="w-full max-w-2xl space-y-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-8 text-center">
              <div className="flex items-center justify-center space-x-3 mb-4">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  Interview in Progress
                </p>
              </div>
              <p className="text-slate-700 dark:text-slate-300 mb-4">
                The AI interviewer is ready to speak with you. Start talking when you're ready!
              </p>
              
              {/* Audio level indicators */}
              <div className="flex items-center justify-center space-x-8 mb-6">
                <div className="text-center">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">Your Audio</p>
                  <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-100"
                      style={{ width: `${conversation.getInputVolume() * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">AI Audio</p>
                  <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-100"
                      style={{ width: `${conversation.getOutputVolume() * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Microphone mute toggle */}
              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={() => {
                    // Note: The @11labs/react hook doesn't expose a direct mute toggle
                    // This would need to be implemented via the underlying audio stream
                    console.log('Mute toggle clicked');
                  }}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  {conversation.micMuted ? '🔇 Unmute' : '🎤 Mute'}
                </button>
              </div>
            </div>

            <button
              onClick={handleEndConversation}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              End Interview
            </button>
          </div>
        )}

        {isSessionStarted && conversation.status === 'disconnected' && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
            <h2 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
              Interview Complete
            </h2>
            <p className="text-green-700 dark:text-green-300">
              Thank you for completing the interview! We'll review your responses and get back to you soon.
            </p>
          </div>
        )}
      </div>

      <div className="text-center text-sm text-slate-500 dark:text-slate-400">
        <p>Having trouble? Contact support for assistance.</p>
      </div>
    </div>
  );
}
