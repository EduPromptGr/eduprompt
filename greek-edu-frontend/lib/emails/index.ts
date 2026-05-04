// lib/emails/index.ts
//
// Barrel export για καθαρά imports:
//   import { sendEmail, welcomeEmail } from '@/lib/emails'

export { sendEmail } from './send'
export type { SendEmailInput, SendEmailResult } from './send'

export { renderEmailLayout, escape } from './layout'
export type { EmailLayoutOptions } from './layout'

export { welcomeEmail } from './templates/welcome'
export type { WelcomeEmailOptions } from './templates/welcome'

export { invoicePaidEmail } from './templates/invoicePaid'
export type { InvoicePaidEmailOptions } from './templates/invoicePaid'

export { schoolInviteEmail } from './templates/schoolInvite'
export type { SchoolInviteEmailOptions } from './templates/schoolInvite'

export { referralRewardEmail } from './templates/referralReward'
export type { ReferralRewardEmailOptions } from './templates/referralReward'
