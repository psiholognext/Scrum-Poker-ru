'use client'

import { QRCodeSVG } from 'qrcode.react'

interface QRCodeProps {
  value: string
  size?: number
}

export function QRCode({ value, size = 160 }: QRCodeProps) {
  return (
    <div className="bg-white p-4 rounded-lg flex items-center justify-center">
      <QRCodeSVG value={value} size={size} marginSize={2} />
    </div>
  )
}
