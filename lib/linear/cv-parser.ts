/**
 * CV Parsing Module
 *
 * Extracts text content from CV files (PDF, DOC, DOCX)
 */

import mammoth from "mammoth";
import { fileTypeFromBuffer } from "file-type";

/**
 * Parse CV file and extract text content
 *
 * @param fileBuffer File buffer containing CV data
 * @param fileName Original file name for fallback type detection
 * @returns Extracted text content from CV
 */
export async function parseCV(
  fileBuffer: Buffer,
  fileName: string
): Promise<string> {
  try {
    const detectedType = await fileTypeFromBuffer(fileBuffer);
    const fileExtension = fileName.toLowerCase().split(".").pop();

    let fileType: string | undefined;

    if (detectedType) {
      fileType = detectedType.mime;
    } else if (fileExtension === "pdf") {
      fileType = "application/pdf";
    } else if (fileExtension === "doc") {
      fileType = "application/msword";
    } else if (fileExtension === "docx") {
      fileType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    // Parse based on file type
    if (fileType === "application/pdf") {
      return await parsePDF(fileBuffer);
    } else if (
      fileType === "application/msword" ||
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileExtension === "doc" ||
      fileExtension === "docx"
    ) {
      return await parseDOCX(fileBuffer);
    } else {
      throw new Error(`Unsupported file type: ${fileType || "unknown"}`);
    }
  } catch (error) {
    throw new Error(
      `Failed to parse CV file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Parse PDF using unpdf
 */
async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const { extractText } = await import("unpdf");

    const result = await extractText(new Uint8Array(buffer));
    const joined = result.text.join("\n").trim();

    if (!joined) {
      throw new Error(
        "PDF file appears to be empty or contains no extractable text"
      );
    }

    return joined;
  } catch (error) {
    throw new Error(
      `Failed to parse PDF: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Parse DOCX using Mammoth
 */
async function parseDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });

    if (!result.value?.trim()) {
      throw new Error(
        "Document file appears to be empty or contains no extractable text"
      );
    }

    if (result.messages?.length > 0) {
      console.warn("Mammoth parsing warnings:", result.messages);
    }

    return result.value.trim();
  } catch (error) {
    throw new Error(
      `Failed to parse DOCX: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
