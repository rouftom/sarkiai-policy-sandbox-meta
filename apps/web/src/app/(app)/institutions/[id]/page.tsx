'use client'

import { use } from 'react'
import { RegistryDetail } from '@/components/registry/registry-detail'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <RegistryDetail path="institutions" id={id} />
}
