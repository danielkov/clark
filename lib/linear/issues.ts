/**
 * Linear Issue Management
 * 
 * Handles creation and management of Linear Issues for candidate applications
 * Requirements: 3.3, 3.4, 3.5, 3.6
 */

import { createLinearClient } from './client';
import { Issue } from '@linear/sdk';
import { getOrgConfig } from '../redis';
import { withRetry, isRetryableError } from '../utils/retry';

/**
 * Create a candidate Issue in Linear for a job application
 * 
 * @param linearOrg Linear organization name
 * @param projectId Linear Project ID (job listing)
 * @param candidateData Candidate application data
 * @returns Created Issue
 */
export async function createCandidateIssue(
  linearOrg: string,
  projectId: string,
  candidateData: {
    name: string;
    email: string;
    cvFile: File;
    coverLetterFile?: File | null;
  }
): Promise<Issue> {
  // Get the org config from Redis
  const config = await getOrgConfig(linearOrg);
  
  if (!config) {
    throw new Error('Organization configuration not found');
  }
  
  // Create Linear client with org token
  const client = createLinearClient(config.accessToken);
  
  // Fetch the project to get team information with retry logic
  const project = await withRetry(
    () => client.project(projectId),
    {
      maxAttempts: 3,
      initialDelayMs: 1000,
      shouldRetry: isRetryableError,
    }
  );
  
  if (!project) {
    throw new Error('Project not found');
  }
  
  // Get the team from the project
  const teams = await project.teams();
  const team = teams.nodes[0];
  
  if (!team) {
    throw new Error('No team associated with project');
  }
  
  // Get the "Triage" workflow state for this team
  // If no "Triage" state exists, use ToDo
  const workflowStates = await team.states();
  let initialStateId = workflowStates.nodes[0]?.id;
  for (let index = 0; index < workflowStates.nodes.length; index += 1) {
    const lower = workflowStates.nodes[index].name.toLowerCase();
    if (lower === 'triage') {
        initialStateId = workflowStates.nodes[index].id;
        break;
    } else if (lower === 'todo') {
        initialStateId = workflowStates.nodes[index].id;
    }
  }
  if (!initialStateId) {
    throw new Error('No workflow states found for team');
  }
  
  // Get or create "New" label
  const issueLabels = await client.issueLabels();
  let newLabel = issueLabels.nodes.find((label: any) => label.name === 'New');
  
  if (!newLabel) {
    const createLabelResult = await client.createIssueLabel({
      name: 'New',
      color: '#5E6AD2', // Linear purple
    });
    
    if (createLabelResult.success && createLabelResult.issueLabel) {
      newLabel = await createLabelResult.issueLabel;
    }
  }
  
  // Create the Issue title and description
  const issueTitle = `${candidateData.name} - Application`;
  const issueDescription = `
# Candidate Application

**Name:** ${candidateData.name}
**Email:** ${candidateData.email}

## Documents
- CV: Attached
${candidateData.coverLetterFile ? '- Cover Letter: Attached' : ''}
  `.trim();
  
  // Create the Issue with retry logic and "New" label
  const issuePayload = await withRetry(
    () => client.createIssue({
      teamId: team.id,
      title: issueTitle,
      description: issueDescription,
      stateId: initialStateId,
      projectId: projectId,
      labelIds: newLabel ? [newLabel.id] : [],
    }),
    {
      maxAttempts: 3,
      initialDelayMs: 1000,
      shouldRetry: isRetryableError,
    }
  );
  
  if (!issuePayload.success || !issuePayload.issue) {
    throw new Error('Failed to create candidate Issue');
  }
  
  const issue = await issuePayload.issue;

  // Add a comment to mention source of this submission
  try {
    await client.createComment({
      issueId: issue.id,
      body: `*This candidate was automatically added via the ATS application form.*`,
      createAsUser: "Clark (bot)",
    });
  } catch (error) {
    // this step is optional, but log error
    console.log("Failed to add source comment", error);
  }
  
  // Upload CV as a Linear attachment with retry logic
  await withRetry(
    () => uploadFileToIssue(
      client,
      issue.id,
      candidateData.cvFile,
      `${candidateData.name} - CV`
    ),
    {
      maxAttempts: 3,
      initialDelayMs: 1000,
      shouldRetry: isRetryableError,
    }
  );
  
  // Upload cover letter if provided with retry logic
  if (candidateData.coverLetterFile) {
    const coverLetter = candidateData.coverLetterFile;
    await withRetry(
      () => uploadFileToIssue(
        client,
        issue.id,
        coverLetter,
        `${candidateData.name} - Cover Letter`
      ),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
  }
  
  return issue;
}

/**
 * Upload a file as a Linear attachment linked to an Issue
 * Uses Linear's file upload API endpoint
 * 
 * @param client Authenticated Linear client
 * @param issueId Issue ID to attach file to
 * @param file File to upload
 * @param title Attachment title
 */
async function uploadFileToIssue(
  client: ReturnType<typeof createLinearClient>,
  issueId: string,
  file: File,
  title: string
): Promise<void> {
  // Step 1: Request upload URL from Linear
  const uploadPayload = await client.fileUpload(
    file.type,
    file.name,
    file.size
  );
  
  if (!uploadPayload.success || !uploadPayload.uploadFile) {
    throw new Error(`Failed to get upload URL for: ${title}`);
  }
  
  const { uploadUrl, assetUrl, headers } = uploadPayload.uploadFile;
  
  // Log the upload details for debugging
  console.log('Upload URL received:', { uploadUrl, assetUrl, headers });
  
  // Step 2: Upload file to the provided URL
  // The signed URL requires specific headers to match the signature
  const arrayBuffer = await file.arrayBuffer();
  
  // Build headers object with all required headers
  const headerObj: Record<string, string> = {
    'Content-Type': file.type, // Required by signed URL
  };
  
  // Add headers provided by Linear
  if (headers && headers.length > 0) {
    headers.forEach((header) => {
      headerObj[header.key] = header.value;
    });
  }
  
  const uploadOptions: RequestInit = {
    method: 'PUT',
    headers: headerObj,
    body: arrayBuffer,
  };
  
  const uploadResponse = await fetch(uploadUrl, uploadOptions);
  
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error('Failed to upload file:', errorText);
    throw new Error(`Failed to upload file: ${title}. Status: ${uploadResponse.status}`);
  }
  
  // Step 3: Create attachment in Linear linking to the uploaded file
  const attachmentPayload = await client.createAttachment({
    issueId,
    title,
    url: assetUrl,
    // Optionally add subtitle with file metadata
    subtitle: `${file.name} (${(file.size / 1024).toFixed(2)} KB)`,
  });
  
  if (!attachmentPayload.success) {
    throw new Error(`Failed to create attachment: ${title}`);
  }
}
