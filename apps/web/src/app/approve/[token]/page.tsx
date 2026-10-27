import { ApprovalView } from '@/components/approval-view'

export const metadata = {
  title: 'Approval — SarkiAI Policy Sandbox',
  robots: { index: false, follow: false },
}

export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ApprovalView token={token} />
}
