'use client';

/**
 * Application Form Component
 * 
 * Handles job application submissions with:
 * - Name, Email, CV, and Cover Letter fields
 * - Client-side validation with real-time feedback
 * - Drag-and-drop file upload support
 * - File type and size validation (PDF, DOC, DOCX, max 10MB)
 */

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { submitApplication } from '@/lib/actions/application';
import { ValidationError } from '@/types';
import { Upload, X, FileText, CheckCircle2 } from 'lucide-react';
import { useState, useRef, DragEvent, ChangeEvent, FormEvent } from 'react';


interface ApplicationFormProps {
  jobId: string;
  linearOrg: string;
  onSuccess?: () => void;
}

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const ACCEPTED_FILE_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

export function ApplicationForm({ jobId, linearOrg, onSuccess }: ApplicationFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isDraggingCv, setIsDraggingCv] = useState(false);
  const [isDraggingCoverLetter, setIsDraggingCoverLetter] = useState(false);
  
  const cvInputRef = useRef<HTMLInputElement>(null);
  const coverLetterInputRef = useRef<HTMLInputElement>(null);

  // Validation functions
  const validateEmail = (email: string): string | null => {
    if (!email.trim()) {
      return 'Email is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    return null;
  };

  const validateName = (name: string): string | null => {
    if (!name.trim()) {
      return 'Name is required';
    }
    return null;
  };

  const validateFile = (file: File | null, required: boolean = true): string | null => {
    if (!file && required) {
      return 'CV is required';
    }
    if (!file) return null;
    
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 10MB';
    }
    
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      return 'File must be PDF, DOC, or DOCX format';
    }
    
    return null;
  };

  // Real-time validation
  const handleNameChange = (value: string) => {
    setName(value);
    if (touched.name) {
      const error = validateName(value);
      setErrors(prev => ({ ...prev, name: error || '' }));
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (touched.email) {
      const error = validateEmail(value);
      setErrors(prev => ({ ...prev, email: error || '' }));
    }
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    
    // Validate on blur
    if (field === 'name') {
      const error = validateName(name);
      setErrors(prev => ({ ...prev, name: error || '' }));
    } else if (field === 'email') {
      const error = validateEmail(email);
      setErrors(prev => ({ ...prev, email: error || '' }));
    }
  };

  // File handling
  const handleFileSelect = (file: File, type: 'cv' | 'coverLetter') => {
    const error = validateFile(file, type === 'cv');
    
    if (error) {
      setErrors(prev => ({ ...prev, [type]: error }));
      return;
    }
    
    if (type === 'cv') {
      setCvFile(file);
      setErrors(prev => ({ ...prev, cv: '' }));
      setTouched(prev => ({ ...prev, cv: true }));
    } else {
      setCoverLetterFile(file);
      setErrors(prev => ({ ...prev, coverLetter: '' }));
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>, type: 'cv' | 'coverLetter') => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file, type);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, type: 'cv' | 'coverLetter') => {
    e.preventDefault();
    if (type === 'cv') {
      setIsDraggingCv(true);
    } else {
      setIsDraggingCoverLetter(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>, type: 'cv' | 'coverLetter') => {
    e.preventDefault();
    if (type === 'cv') {
      setIsDraggingCv(false);
    } else {
      setIsDraggingCoverLetter(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, type: 'cv' | 'coverLetter') => {
    e.preventDefault();
    if (type === 'cv') {
      setIsDraggingCv(false);
    } else {
      setIsDraggingCoverLetter(false);
    }
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file, type);
    }
  };

  const removeFile = (type: 'cv' | 'coverLetter') => {
    if (type === 'cv') {
      setCvFile(null);
      if (cvInputRef.current) {
        cvInputRef.current.value = '';
      }
    } else {
      setCoverLetterFile(null);
      if (coverLetterInputRef.current) {
        coverLetterInputRef.current.value = '';
      }
    }
  };

  // Form submission
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Mark all fields as touched
    setTouched({
      name: true,
      email: true,
      cv: true,
    });
    
    // Validate all fields
    const nameError = validateName(name);
    const emailError = validateEmail(email);
    const cvError = validateFile(cvFile, true);
    const coverLetterError = validateFile(coverLetterFile, false);
    
    const newErrors: Record<string, string> = {};
    if (nameError) newErrors.name = nameError;
    if (emailError) newErrors.email = emailError;
    if (cvError) newErrors.cv = cvError;
    if (coverLetterError) newErrors.coverLetter = coverLetterError;
    
    setErrors(newErrors);
    
    // Stop if there are errors
    if (Object.keys(newErrors).length > 0) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('jobId', jobId);
      formData.append('linearOrg', linearOrg);
      if (cvFile) {
        formData.append('cv', cvFile);
      }
      if (coverLetterFile) {
        formData.append('coverLetter', coverLetterFile);
      }
      
      const result = await submitApplication(formData);
      
      if (!result.success) {
        if (result.errors) {
          const errorMap: Record<string, string> = {};
          result.errors.forEach((err: ValidationError) => {
            errorMap[err.field] = err.message;
          });
          setErrors(errorMap);
        } else {
          setErrors({ submit: 'Failed to submit application' });
        }
        return;
      }
      
      // Success!
      setSubmitSuccess(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Application submission error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <Card className="px-6">
        <div className="text-center py-8">
          <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-2xl font-semibold text-gray-900 mb-2">
            Application Submitted!
          </h3>
          <p className="text-gray-600">
            Thank you for your application. We'll review it and get back to you soon.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="px-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name field */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={() => handleBlur('name')}
            className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.name && touched.name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="John Doe"
          />
          {errors.name && touched.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name}</p>
          )}
        </div>

        {/* Email field */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            onBlur={() => handleBlur('email')}
            className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.email && touched.email ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="john@example.com"
          />
          {errors.email && touched.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
        </div>

        {/* CV upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CV/Resume <span className="text-red-500">*</span>
          </label>
          <div
            onDragOver={(e) => handleDragOver(e, 'cv')}
            onDragLeave={(e) => handleDragLeave(e, 'cv')}
            onDrop={(e) => handleDrop(e, 'cv')}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDraggingCv
                ? 'border-blue-500 bg-blue-50'
                : errors.cv && touched.cv
                ? 'border-red-500 bg-red-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            {cvFile ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-blue-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{cvFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(cvFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile('cv')}
                  className="p-1 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-2">
                  Drag and drop your CV here, or click to browse
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  PDF, DOC, or DOCX (max 10MB)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cvInputRef.current?.click()}
                >
                  Choose File
                </Button>
              </>
            )}
            <input
              ref={cvInputRef}
              type="file"
              accept={ACCEPTED_FILE_EXTENSIONS.join(',')}
              onChange={(e) => handleFileInputChange(e, 'cv')}
              className="hidden"
            />
          </div>
          {errors.cv && touched.cv && (
            <p className="mt-1 text-sm text-red-600">{errors.cv}</p>
          )}
        </div>

        {/* Cover Letter upload (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cover Letter <span className="text-gray-500 text-xs">(Optional)</span>
          </label>
          <div
            onDragOver={(e) => handleDragOver(e, 'coverLetter')}
            onDragLeave={(e) => handleDragLeave(e, 'coverLetter')}
            onDrop={(e) => handleDrop(e, 'coverLetter')}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDraggingCoverLetter
                ? 'border-blue-500 bg-blue-50'
                : errors.coverLetter
                ? 'border-red-500 bg-red-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            {coverLetterFile ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-blue-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{coverLetterFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(coverLetterFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile('coverLetter')}
                  className="p-1 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-2">
                  Drag and drop your cover letter here, or click to browse
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  PDF, DOC, or DOCX (max 10MB)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => coverLetterInputRef.current?.click()}
                >
                  Choose File
                </Button>
              </>
            )}
            <input
              ref={coverLetterInputRef}
              type="file"
              accept={ACCEPTED_FILE_EXTENSIONS.join(',')}
              onChange={(e) => handleFileInputChange(e, 'coverLetter')}
              className="hidden"
            />
          </div>
          {errors.coverLetter && (
            <p className="mt-1 text-sm text-red-600">{errors.coverLetter}</p>
          )}
        </div>

        {/* Submit error */}
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{errors.submit}</p>
          </div>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full"
          size="lg"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Application'}
        </Button>
      </form>
    </Card>
  );
}
