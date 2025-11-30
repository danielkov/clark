# Requirements Document

## Introduction

This document specifies the requirements for an AI-enriched Applicant Tracking System (ATS) that integrates with Linear as its source of truth. The system uses NextJS as a full-stack framework, WorkOS for authentication, and Cerebras for AI inference capabilities. The ATS maps Linear's organizational structure to recruitment workflows: Initiatives represent hiring containers, Projects represent job openings, Issues represent candidates, and Documents store tone of voice guides and applicant materials.

## Glossary

- **ATS**: Applicant Tracking System - the software system for managing recruitment workflows
- **WorkOS**: Third-party authentication service providing login/signup capabilities
- **Linear**: Project management platform serving as the source of truth for all ATS data
- **Linear Initiative**: A container in Linear representing the organization's hiring function
- **Linear Project**: A Linear entity representing a specific job opening (e.g., "Senior Frontend Engineer")
- **Linear Issue**: A Linear entity representing an individual applicant/candidate
- **Linear Document**: A Linear entity for storing text content such as tone of voice guides, CVs, and cover letters
- **ATS Container**: The designated Linear Initiative that holds all recruitment-related Projects
- **Job Listing**: A publicly visible job posting on the website derived from a Linear Project
- **Cerebras**: AI inference platform providing fast LLM API for model inference
- **Tone of Voice Document**: A Linear Document defining the organization's communication style for job descriptions
- **AI Pre-screening Agent**: Automated system component that evaluates candidate fit using AI
- **NextJS**: Full-stack React framework used for building the application

## Requirements

### Requirement 1

**User Story:** As an unauthenticated user, I want to create an account and connect my Linear workspace, so that I can start using the ATS with my existing Linear setup.

#### Acceptance Criteria

1. WHEN an unauthenticated user accesses the ATS application, THE ATS SHALL present the WorkOS authentication interface
2. WHEN a user completes authentication via WorkOS, THE ATS SHALL prompt the user to authorize the Linear integration using OAuth 2 actor authorization
3. WHEN the Linear integration is authorized, THE ATS SHALL fetch the list of existing Linear Initiatives from the user's workspace
4. WHEN the list of Initiatives is displayed, THE ATS SHALL allow the user to select one existing Initiative or create a new Initiative to designate as the ATS Container
5. WHEN the ATS Container Initiative is established, THE ATS SHALL verify whether a Tone of Voice Document exists within that Initiative
6. IF no Tone of Voice Document exists in the ATS Container Initiative, THEN THE ATS SHALL generate a default Tone of Voice Document within that Initiative

### Requirement 2

**User Story:** As a recruiter, I want job listings to automatically publish when I mark Linear Projects as "In Progress", so that I can manage job visibility through my existing Linear workflow.

#### Acceptance Criteria

1. WHEN a Linear Project within the ATS Container Initiative transitions to status "In Progress", THE ATS SHALL publish the Project as a Job Listing on the public website
2. WHILE a Linear Project status is any value other than "In Progress", THE ATS SHALL exclude the Project from the public website Job Listings
3. WHEN a Linear Project transitions to "In Progress" status, THE ATS SHALL check for the presence of the "ai-generated" label on that Project
4. IF the "ai-generated" label is absent from an "In Progress" Project, THEN THE ATS SHALL invoke the LLM to generate a structured Job Description using the Project's existing description and the Initiative's Tone of Voice Document as inputs
5. WHEN the LLM successfully generates a Job Description, THE ATS SHALL update the Linear Project description field with the generated content and apply the "ai-generated" label to the Project
6. WHEN a user modifies a Project description in Linear, THE ATS SHALL synchronize the updated description to the public Job Listing within 30 seconds

### Requirement 3

**User Story:** As a job applicant, I want to submit my application through the website, so that my information is captured in the recruiter's system.

#### Acceptance Criteria

1. WHEN an applicant submits the application form on the website, THE ATS SHALL validate that the Name field is non-empty, the Email field contains a valid email address, and the CV file is present
2. IF validation fails for any required field, THEN THE ATS SHALL display specific error messages and prevent form submission
3. WHEN validation succeeds, THE ATS SHALL create a new Linear Issue within the Linear Project associated with the Job Listing
4. WHEN creating the Linear Issue, THE ATS SHALL upload the applicant's CV as a Linear Document attachment linked to that Issue
5. IF a cover letter is provided, THEN THE ATS SHALL upload the cover letter as a Linear Document attachment linked to the Issue
6. WHEN the Linear Issue is created, THE ATS SHALL set the Issue state to "Triage" or the default entry state configured in the Linear workflow

### Requirement 4

**User Story:** As a recruiter, I want AI to automatically pre-screen candidates, so that I can focus my time on the most promising applicants.

#### Acceptance Criteria

1. WHEN a new Linear Issue is created within a Linear Project that has status "In Progress", THE ATS SHALL trigger the AI Pre-screening Agent
2. WHEN the AI Pre-screening Agent executes, THE ATS SHALL compare the candidate's CV content against the Job Description associated with the Linear Project
3. IF the AI determines a high-confidence match between the candidate and job requirements, THEN THE ATS SHALL transition the Linear Issue to the "Screening" workflow state
4. IF the AI determines a low-confidence match or rejection, THEN THE ATS SHALL transition the Linear Issue to the "Declined" workflow state
5. IF the AI determines an ambiguous or uncertain match, THEN THE ATS SHALL maintain the Linear Issue in the "Triage" workflow state
6. WHEN the AI Pre-screening Agent transitions an Issue state, THE ATS SHALL add a comment to the Linear Issue explaining the AI's reasoning with specific evidence from the CV

### Requirement 5

**User Story:** As a system architect, I want to leverage Cerebras for AI capabilities, so that the system has fast and reliable AI inference.

#### Acceptance Criteria

1. WHEN the ATS needs to perform LLM inference for Job Description generation or Candidate Screening, THE ATS SHALL use Cerebras API to execute the LLM operations
2. WHEN an applicant uploads a CV file, THE ATS SHALL parse the document content using pdf-parse for PDF files and mammoth for DOC/DOCX files
3. WHEN the CV content is extracted, THE ATS SHALL append the text content to the Linear Issue description separated by a line break
4. WHEN an applicant uploads a CV file, THE ATS SHALL also store the file as a Linear Document attachment for human recruiter access
5. WHEN generating job descriptions, THE ATS SHALL use the Cerebras llama-3.3-70b model with appropriate temperature and token settings for consistent, high-quality output
