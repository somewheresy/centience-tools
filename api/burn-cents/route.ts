import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { headers } from 'next/headers';
import { CENTS_TOKEN_MINT, BURN_ADDRESS, CENTS_TO_BURN } from '@/lib/constants';

export async function POST(request: Request) {
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

    // Get the token account
    const publicKey = new PublicKey(walletAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      publicKey,
      { mint: CENTS_TOKEN_MINT }
    );

    const tokenAccount = tokenAccounts.value[0]?.pubkey;
    if (!tokenAccount) {
      return NextResponse.json(
        { error: 'No CENTS token account found' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      tokenAccount: tokenAccount.toString(),
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash
    });

  } catch (error) {
    console.error('Error preparing burn transaction:', error);
    return NextResponse.json(
      { error: 'Failed to prepare burn transaction' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Token, x-wallet-address',
      'Access-Control-Max-Age': '86400',
    },
  });
} 