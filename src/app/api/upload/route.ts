import { NextRequest, NextResponse } from 'next/server'
import { ExcelParser } from '@/lib/excel-parser'
import { ApiResponse, UploadResponse } from '@/types/api'
import { v4 as uuidv4 } from 'uuid'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'No file provided',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv' // alternative CSV mime type
    ]
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'File size exceeds 10MB limit',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Ensure uploads directory exists
    const uploadsDir = path.join('/tmp', 'uploads')
    try {
      await mkdir(uploadsDir, { recursive: true })
    } catch (error) {
      // Directory might already exist, ignore error
    }
    
    // Save file temporarily for processing
    const uniqueFilename = `${uuidv4()}-${file.name}`
    const filepath = path.join(uploadsDir, uniqueFilename)
    
    try {
      const bytes = await file.arrayBuffer()
      await writeFile(filepath, Buffer.from(bytes))
      
      // Parse the Excel/CSV file
      const parseResult = await ExcelParser.parseFile(file)
      
      if (!parseResult.success) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: parseResult.errors.join('; '),
          timestamp: new Date().toISOString()
        }, { status: 400 })
      }
      
      // Prepare response data
      const customers = parseResult.customers.map(customer => ({
        name: customer.name,
        phone: customer.phone,
        reason: customer.reason, // May be undefined
        matchedServices: customer.matchedServices || []
      }))
      
      const response: UploadResponse = {
        customers,
        summary: {
          totalRows: parseResult.totalRows,
          validRows: parseResult.validRows,
          skippedRows: parseResult.skippedRows,
          errors: parseResult.errors
        },
        uploadId: uniqueFilename
      }
      
      // Clean up temporary file
      try {
        const fs = await import('fs/promises')
        await fs.unlink(filepath)
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary file:', cleanupError)
      }
      
      return NextResponse.json<ApiResponse<UploadResponse>>({
        success: true,
        data: response,
        message: `Successfully processed ${parseResult.validRows} customers`,
        timestamp: new Date().toISOString()
      })
      
    } catch (fileError) {
      // Clean up file if processing fails
      try {
        const fs = await import('fs/promises')
        await fs.unlink(filepath)
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary file:', cleanupError)
      }
      
      throw fileError
    }
    
  } catch (error) {
    console.error('Upload API error:', error)
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process upload',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Handle GET requests (not allowed)
export async function GET() {
  return NextResponse.json<ApiResponse<null>>({
    success: false,
    error: 'Method not allowed. Use POST to upload files.',
    timestamp: new Date().toISOString()
  }, { status: 405 })
}

// Handle other methods
export async function PUT() {
  return NextResponse.json<ApiResponse<null>>({
    success: false,
    error: 'Method not allowed',
    timestamp: new Date().toISOString()
  }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json<ApiResponse<null>>({
    success: false,
    error: 'Method not allowed',
    timestamp: new Date().toISOString()
  }, { status: 405 })
}