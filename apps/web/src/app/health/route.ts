import { NextResponse } from 'next/server';
import { BRAND } from '../../lib/brand';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'web',
    brand: BRAND.name,
    timestamp: new Date().toISOString(),
  });
}
