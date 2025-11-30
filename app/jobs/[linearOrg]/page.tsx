/**
 * Public Job Board - Organization Listings
 * 
 * Server-side rendered page showing all published job listings for a Linear organization
 */

import Link from 'next/link';

import { getPublishedJobsByOrg } from '@/lib/linear/projects';
import { JobListing } from '@/types';
import { SparklesIcon } from 'lucide-react';

interface JobBoardPageProps {
  params: Promise<{
    linearOrg: string;
  }>;
}

export default async function JobBoardPage({ params }: JobBoardPageProps) {
  const { linearOrg } = await params;
  
  console.log('[JobBoardPage] Starting, linearOrg:', linearOrg);
  
  let jobs: JobListing[] = [];
  let error: string | null = null;

  try {
    console.log('[JobBoardPage] About to call getPublishedJobsByOrg');
    jobs = await getPublishedJobsByOrg(linearOrg);
    console.log('[JobBoardPage] getPublishedJobsByOrg returned', jobs.length, 'jobs');
  } catch (err) {
    console.error('[JobBoardPage] Failed to fetch jobs:', err);
    error = 'Failed to load job listings. Please try again later.';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Open Positions
          </h1>
          <p className="text-lg text-gray-600">
            Join our team and help us build something amazing
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {!error && jobs.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-600 text-lg">
              No open positions at the moment. Check back soon!
            </p>
          </div>
        )}

        {!error && jobs.length > 0 && (
          <div className="space-y-6">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${linearOrg}/${job.id}`}
                className="block bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                      {job.title}
                    </h2>
                    
                    {job.description && (
                      <p className="text-gray-600 line-clamp-3 mb-4">
                        {job.description.substring(0, 200)}
                        {job.description.length > 200 ? '...' : ''}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>
                        Posted {new Date(job.createdAt).toLocaleDateString()}
                      </span>
                      {job.isAIGenerated && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          <SparklesIcon className='w-3 h-3' /> AI Enhanced
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="ml-4">
                    <svg
                      className="w-6 h-6 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params }: JobBoardPageProps) {
  const { linearOrg } = await params;
  
  return {
    title: `Careers - ${linearOrg}`,
    description: 'View our open positions and join our team',
  };
}
