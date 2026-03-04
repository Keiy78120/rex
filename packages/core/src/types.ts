export interface CheckResult {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  details?: string
}

export interface CheckGroup {
  name: string
  icon: string
  results: CheckResult[]
}

export type OverallStatus = 'healthy' | 'degraded' | 'broken'

export interface HealthReport {
  groups: CheckGroup[]
  status: OverallStatus
  timestamp: string
  version: string
}
