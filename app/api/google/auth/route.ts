import { NextResponse } from 'next/server';
import { consentUrl, NotConfiguredError } from '@/lib/google/client';

export const dynamic = 'force-dynamic';

/** Kicks off the desktop OAuth loopback flow. */
export async function GET(request: Request) {
  try {
    return NextResponse.redirect(consentUrl());
  } catch (error) {
    if (error instanceof NotConfiguredError) {
      return NextResponse.redirect(new URL('/settings?error=not-configured', request.url));
    }
    throw error;
  }
}
