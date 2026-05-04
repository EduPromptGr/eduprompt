import type { Metadata } from 'next'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Νέος κωδικός — EduPrompt',
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-sky-700">EduPrompt</span>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-6">
            Ορισμός νέου κωδικού
          </h1>
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  )
}
