import * as XLSX from 'xlsx'
import { Customer, CustomerImportResult, ExcelColumnMapping } from '@/types/customer'
import { v4 as uuidv4 } from 'uuid'

// Service keywords for matching customer reasons to services
const SERVICE_KEYWORDS = {
  'credit-card': ['credit card', 'card', 'credit', 'limit', 'interest rate', 'annual fee', 'cashback', 'rewards'],
  'personal-banking': ['account', 'checking', 'savings', 'personal banking', 'fees', 'branch', 'teller', 'deposit'],
  'loans': ['loan', 'personal loan', 'auto loan', 'lending', 'interest', 'payment', 'installment'],
  'mortgage': ['mortgage', 'home loan', 'refinance', 'property', 'house', 'real estate', 'home'],
  'business-banking': ['business', 'commercial', 'business account', 'merchant', 'payroll', 'corporate'],
  'investment': ['investment', 'wealth', 'portfolio', 'advisor', 'trading', 'retirement', 'stocks', 'bonds'],
  'mobile-online': ['mobile', 'online', 'app', 'digital', 'website', 'login', 'technology', 'internet'],
  'customer-service': ['service', 'support', 'staff', 'wait time', 'help', 'experience', 'rude', 'unprofessional']
}

export class ExcelParser {
  /**
   * Parse Excel or CSV file and extract customer data
   */
  static async parseFile(file: File): Promise<CustomerImportResult> {
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { 
        type: 'buffer',
        cellText: true,
        cellDates: true 
      })
      
      // Get first sheet
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
        blankrows: false 
      }) as string[][]
      
      if (jsonData.length === 0) {
        return {
          success: false,
          customers: [],
          errors: ['File is empty'],
          totalRows: 0,
          validRows: 0,
          skippedRows: 0
        }
      }
      
      // Detect column mapping
      const headers = jsonData[0].map(h => String(h).toLowerCase().trim())
      const columnMapping = this.detectColumnMapping(headers)
      
      if (!columnMapping.name || !columnMapping.phone) {
        return {
          success: false,
          customers: [],
          errors: ['Required columns not found. Please ensure your file has: Name and Phone Number'],
          totalRows: jsonData.length,
          validRows: 0,
          skippedRows: jsonData.length
        }
      }
      
      // Process data rows
      const dataRows = jsonData.slice(1)
      const customers: Customer[] = []
      const errors: string[] = []
      let skippedRows = 0
      
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]
        const rowNumber = i + 2 // +2 because we start from row 2 (after header)
        
        try {
          const customer = this.parseCustomerRow(row, columnMapping, rowNumber)
          if (customer) {
            customers.push(customer)
          } else {
            skippedRows++
          }
        } catch (error) {
          errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Invalid data'}`)
          skippedRows++
        }
      }
      
      return {
        success: true,
        customers,
        errors,
        totalRows: jsonData.length,
        validRows: customers.length,
        skippedRows
      }
      
    } catch (error) {
      return {
        success: false,
        customers: [],
        errors: [`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        totalRows: 0,
        validRows: 0,
        skippedRows: 0
      }
    }
  }
  
  /**
   * Detect column mapping from headers
   */
  private static detectColumnMapping(headers: string[]): ExcelColumnMapping {
    const mapping: ExcelColumnMapping = {}
    
    headers.forEach((header, index) => {
      const cleanHeader = header.toLowerCase().trim()
      
      // Name variations
      if (cleanHeader.includes('name') || cleanHeader.includes('customer')) {
        mapping.name = index.toString()
      }
      
      // Phone variations
      if (cleanHeader.includes('phone') || cleanHeader.includes('mobile') || 
          cleanHeader.includes('number') || cleanHeader.includes('contact')) {
        mapping.phone = index.toString()
      }
      
      // Reason variations (optional now)
      if (cleanHeader.includes('reason') || cleanHeader.includes('leaving') || 
          cleanHeader.includes('issue') || cleanHeader.includes('complaint') ||
          cleanHeader.includes('feedback') || cleanHeader.includes('comment')) {
        mapping.reason = index.toString()
      }
      
      // Optional fields
      if (cleanHeader.includes('email')) {
        mapping.email = index.toString()
      }
      
      if (cleanHeader.includes('account')) {
        mapping.accountNumber = index.toString()
      }
      
      if (cleanHeader.includes('service') || cleanHeader.includes('product')) {
        mapping.serviceType = index.toString()
      }
      
      if (cleanHeader.includes('date') && cleanHeader.includes('left')) {
        mapping.dateLeft = index.toString()
      }
    })
    
    return mapping
  }
  
  /**
   * Parse individual customer row
   */
  private static parseCustomerRow(
    row: string[], 
    mapping: ExcelColumnMapping, 
    rowNumber: number
  ): Customer | null {
    const name = mapping.name ? String(row[parseInt(mapping.name)] || '').trim() : ''
    const phone = mapping.phone ? String(row[parseInt(mapping.phone)] || '').trim() : ''
    const reason = mapping.reason ? String(row[parseInt(mapping.reason)] || '').trim() : ''
    
    // Validate required fields (only name and phone are required now)
    if (!name || !phone) {
      if (!name && !phone) {
        // Empty row, skip silently
        return null
      }
      throw new Error('Missing required data (Name or Phone)')
    }
    
    // Validate phone number format
    const cleanPhone = this.cleanPhoneNumber(phone)
    if (!this.isValidPhoneNumber(cleanPhone)) {
      throw new Error(`Invalid phone number format: ${phone}`)
    }
    
    // Match services based on reason if provided, otherwise empty array
    const matchedServices = reason ? this.matchServices(reason) : []
    
    const customer: Customer = {
      id: uuidv4(),
      name: this.cleanName(name),
      phone: cleanPhone,
      reason: reason || undefined, // Only include if provided
      matchedServices,
      priority: reason ? this.calculatePriority(reason, matchedServices) : 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    // Add optional fields if available
    if (mapping.email) {
      const email = String(row[parseInt(mapping.email)] || '').trim()
      if (email && this.isValidEmail(email)) {
        customer.email = email
      }
    }
    
    if (mapping.accountNumber) {
      customer.accountNumber = String(row[parseInt(mapping.accountNumber)] || '').trim()
    }
    
    if (mapping.serviceType) {
      customer.serviceType = String(row[parseInt(mapping.serviceType)] || '').trim()
    }
    
    return customer
  }
  
  /**
   * Clean and format phone number
   */
  private static cleanPhoneNumber(phone: string): string {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '')
    
    // If starts with +966 (Saudi Arabia), keep as is
    if (cleaned.startsWith('+966')) {
      return cleaned
    }
    
    // If starts with 00966, convert to +966
    if (cleaned.startsWith('00966')) {
      return '+' + cleaned.substring(2)
    }
    
    // If starts with 966, add +
    if (cleaned.startsWith('966')) {
      return '+' + cleaned
    }
    
    // If starts with 05 (local Saudi format), convert to +966
    if (cleaned.startsWith('05') && cleaned.length === 10) {
      return '+966' + cleaned.substring(1)
    }
    
    // If 9 digits starting with 5, assume Saudi mobile
    if (cleaned.length === 9 && cleaned.startsWith('5')) {
      return '+966' + cleaned
    }
    
    return cleaned
  }
  
  /**
   * Validate phone number format
   */
  private static isValidPhoneNumber(phone: string): boolean {
    // Saudi mobile format: +966XXXXXXXXX (13 digits total)
    const saudiMobile = /^\+966[5][0-9]{8}$/
    
    // International format (basic validation)
    const international = /^\+[1-9]\d{1,14}$/
    
    return saudiMobile.test(phone) || international.test(phone)
  }
  
  /**
   * Clean customer name
   */
  private static cleanName(name: string): string {
    return name.trim()
      .replace(/\s+/g, ' ')  // Multiple spaces to single space
      .replace(/[^\w\s\u0600-\u06FF]/g, '')  // Keep only alphanumeric, spaces, and Arabic characters
      .trim()
  }
  
  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }
  
  /**
   * Match customer reason to banking services
   */
  private static matchServices(reason: string): string[] {
    const lowerReason = reason.toLowerCase()
    const matches: string[] = []
    
    Object.entries(SERVICE_KEYWORDS).forEach(([serviceId, keywords]) => {
      const hasMatch = keywords.some(keyword => 
        lowerReason.includes(keyword.toLowerCase())
      )
      
      if (hasMatch) {
        matches.push(serviceId)
      }
    })
    
    return matches
  }
  
  /**
   * Calculate customer priority based on reason and matched services
   */
  private static calculatePriority(reason: string, matchedServices: string[]): 'high' | 'medium' | 'low' {
    const lowerReason = reason.toLowerCase()
    
    // High priority indicators
    const highPriorityKeywords = [
      'angry', 'frustrated', 'terrible', 'awful', 'worst', 'hate', 'disgusted',
      'lawsuit', 'complaint', 'regulatory', 'unacceptable', 'breach'
    ]
    
    // Medium priority indicators
    const mediumPriorityKeywords = [
      'disappointed', 'unhappy', 'unsatisfied', 'poor', 'bad', 'slow',
      'difficult', 'confusing', 'complicated'
    ]
    
    if (highPriorityKeywords.some(keyword => lowerReason.includes(keyword))) {
      return 'high'
    }
    
    if (mediumPriorityKeywords.some(keyword => lowerReason.includes(keyword))) {
      return 'medium'
    }
    
    // High priority if multiple services affected
    if (matchedServices.length > 2) {
      return 'high'
    }
    
    return 'low'
  }
}