/**
 * CV Parsing Module
 * 
 * Extracts text content from CV files (PDF, DOC, DOCX)
 * Requirements: 5.2
 */

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { fileTypeFromBuffer } from 'file-type';

/**
 * Parse CV file and extract text content
 * 
 * @param fileBuffer File buffer containing CV data
 * @param fileName Original file name for fallback type detection
 * @returns Extracted text content from CV
 * @throws Error if file type is unsupported or parsing fails
 */
export async function parseCV(
  fileBuffer: Buffer,
  fileName: string
): Promise<string> {
  try {
    // Detect file type using file-type library
    const detectedType = await fileTypeFromBuffer(fileBuffer);
    
    // Fallback to file extension if detection fails
    const fileExtension = fileName.toLowerCase().split('.').pop();
    
    // Determine the actual file type
    let fileType: string | undefined;
    
    if (detectedType) {
      fileType = detectedType.mime;
    } else if (fileExtension === 'pdf') {
      fileType = 'application/pdf';
    } else if (fileExtension === 'doc') {
      fileType = 'application/msword';
    } else if (fileExtension === 'docx') {
      fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    
    // Parse based on file type
    if (fileType === 'application/pdf') {
      return await parsePDF(fileBuffer);
    } else if (
      fileType === 'application/msword' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileExtension === 'doc' ||
      fileExtension === 'docx'
    ) {
      return await parseDOCX(fileBuffer);
    } else {
      throw new Error(`Unsupported file type: ${fileType || 'unknown'}`);
    }
  } catch (error) {
    // Re-throw with more context if it's already our error
    if (error instanceof Error && error.message.startsWith('Unsupported file type')) {
      throw error;
    }
    
    // Wrap other errors with context
    throw new Error(
      `Failed to parse CV file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse PDF file and extract text content
 * 
 * @param buffer PDF file buffer
 * @returns Extracted text content
 */
async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    // Convert Buffer to Uint8Array for pdf-parse
    const uint8Array = new Uint8Array(buffer);
    
    // Create PDFParse instance with the buffer data
    const pdfParse = new PDFParse({ data: uint8Array });
    
    // Extract text from the PDF
    const result = await pdfParse.getText();
    
    if (!result.text || result.text.trim().length === 0) {
      throw new Error('PDF file appears to be empty or contains no extractable text');
    }
    
    return result.text.trim();
  } catch (error) {
    throw new Error(
      `Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse DOC/DOCX file and extract text content
 * 
 * @param buffer DOC/DOCX file buffer
 * @returns Extracted text content
 */
async function parseDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('Document file appears to be empty or contains no extractable text');
    }
    
    // Log any warnings from mammoth
    if (result.messages && result.messages.length > 0) {
      console.warn('Mammoth parsing warnings:', result.messages);
    }
    
    return result.value.trim();
  } catch (error) {
    throw new Error(
      `Failed to parse DOC/DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
