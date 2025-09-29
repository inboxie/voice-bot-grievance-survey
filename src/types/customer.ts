export interface Customer {
  id?: string
  name: string
  phone: string
  reason?: string // Optional - will be discovered during the call
  // Optional fields that might be in Excel
  email?: string
  accountNumber?: string
  serviceType?: string
  dateLeft?: string
  lastContactDate?: string
  // Processed fields
  matchedServices?: string[]
  priority?: 'high' | 'medium' | 'low'
  // Metadata
  createdAt?: Date
  updatedAt?: Date
}

export interface CustomerImportResult {
  success: boolean
  customers: Customer[]
  errors: string[]
  totalRows: number
  validRows: number
  skippedRows: number
}

export interface CustomerFilterCriteria {
  services: string[]
  phoneNumberFormat?: 'local' | 'international'
  excludeDuplicates?: boolean
  priorityLevel?: 'high' | 'medium' | 'low' | 'all'
}

export interface ProcessedCustomer extends Customer {
  id: string
  matchedServices: string[]
  priority: 'high' | 'medium' | 'low'
  callEligible: boolean
  createdAt: Date
  updatedAt: Date
}

// Excel column mapping interface
export interface ExcelColumnMapping {
  name?: string
  phone?: string
  reason?: string
  email?: string
  accountNumber?: string
  serviceType?: string
  dateLeft?: string
}

// Service keywords for matching
export interface ServiceKeywords {
  [serviceId: string]: string[]
}