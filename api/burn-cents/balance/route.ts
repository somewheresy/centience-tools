import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { headers } from 'next/headers';
import { CENTS_TOKEN_MINT } from '@/lib/constants';

export async function GET(request: Request) {
  try {
    const headersList = await headers();
    const apiToken = headersList.get('X-API-Token');
    const walletAddress = headersList.get('x-wallet-address') ?? '';
    
    if (!apiToken || apiToken !== process.env.NEXT_PUBLIC_API_SECRET_TOKEN) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!process.env.HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY not configured');
    }

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    );

    const publicKey = new PublicKey(walletAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      publicKey,
      { mint: CENTS_TOKEN_MINT }
    );

    const balance = tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount || 0;

    return NextResponse.json({ balance });

  } catch (error) {
    console.error('Error getting balance:', error);
    return NextResponse.json(
      { error: 'Failed to get balance' },
      { status: 500 }
    );
  }
} 