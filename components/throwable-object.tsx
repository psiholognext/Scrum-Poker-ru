'use client'

import React, { useEffect, useRef } from 'react'

interface ThrowableObjectProps {
  id: string
  objectType: 'paper-ball' | 'snowball' | 'paper-plane' | 'dice'
  senderRect: DOMRectReadOnly
  targetRect: DOMRectReadOnly
  onAnimationEnd: (id: string) => void
}

const objectMap: Record<ThrowableObjectProps['objectType'], string> = {
  'paper-ball': '\u2709\uFE0F',
  'snowball': '\u2744\uFE0F',
  'paper-plane': '\u2708\uFE0F',
  dice: '\uD83C\uDFB2',
}

let sharedAudioContext: AudioContext | null = null
let lastSoundAt = 0

function playThrowSound() {
  if (typeof window === 'undefined') {
    return
  }

  const now = Date.now()
  if (now - lastSoundAt < 90) {
    return
  }
  lastSoundAt = now

  const audioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!audioContextCtor) {
    return
  }

  try {
    const context = sharedAudioContext ?? new audioContextCtor()
    sharedAudioContext = context

    if (context.state === 'suspended') {
      void context.resume()
    }

    const oscillator = context.createOscillator()
    const oscillator2 = context.createOscillator()
    const filter = context.createBiquadFilter()
    const gainNode = context.createGain()

    oscillator.type = 'sine'
    oscillator2.type = 'triangle'
    oscillator.frequency.setValueAtTime(520, context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(310, context.currentTime + 0.16)
    oscillator2.frequency.setValueAtTime(760, context.currentTime)
    oscillator2.frequency.exponentialRampToValueAtTime(420, context.currentTime + 0.16)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1200, context.currentTime)
    filter.Q.setValueAtTime(0.7, context.currentTime)

    gainNode.gain.setValueAtTime(0.0001, context.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.03, context.currentTime + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16)

    oscillator.connect(filter)
    oscillator2.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(context.destination)

    oscillator.start(context.currentTime)
    oscillator2.start(context.currentTime)
    oscillator.stop(context.currentTime + 0.17)
    oscillator2.stop(context.currentTime + 0.17)
  } catch {
    // Ignore unsupported audio environments.
  }
}

export function ThrowableObject({ id, objectType, senderRect, targetRect, onAnimationEnd }: ThrowableObjectProps) {
  const objectRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const objectElement = objectRef.current
    if (!objectElement) return

    objectElement.style.left = `${senderRect.x + senderRect.width / 2}px`
    objectElement.style.top = `${senderRect.y + senderRect.height / 2}px`
    objectElement.style.opacity = '1'
    objectElement.style.transform = 'translate(-50%, -50%) scale(1)'

    playThrowSound()

    if (navigator.vibrate) {
      navigator.vibrate(50)
    }

    const targetX = targetRect.x + targetRect.width / 2
    const targetY = targetRect.y + targetRect.height / 2

    const deltaX = targetX - (senderRect.x + senderRect.width / 2)
    const deltaY = targetY - (senderRect.y + senderRect.height / 2)

    objectElement.style.transition = 'transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.7s ease-out'
    objectElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.8)`
    objectElement.style.opacity = '0.8'

    const timer = setTimeout(() => {
      objectElement.style.transition = 'opacity 0.3s ease-in'
      objectElement.style.opacity = '0'
      setTimeout(() => onAnimationEnd(id), 300)
    }, 700)

    return () => clearTimeout(timer)
  }, [id, senderRect, targetRect, onAnimationEnd])

  return (
    <div
      ref={objectRef}
      className="fixed z-50 text-2xl sm:text-3xl pointer-events-none drop-shadow-lg"
      style={{
        opacity: 0,
        transform: 'translate(-50%, -50%) scale(0)',
      }}
    >
      {objectMap[objectType]}
    </div>
  )
}
