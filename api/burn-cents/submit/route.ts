import { NextResponse } from 'next/server';
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  try {
    const headersList = await headers();
    const apiToken = headersList.get('X-API-Token');
    
    if (!apiToken || apiToken !== process.env.NEXT_PUBLIC_API_SECRET_TOKEN) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { serializedTransaction } = await request.json();

    if (!serializedTransaction) {
      return NextResponse.json(
        { error: 'Missing serialized transaction' },
        { status: 400 }
      );
    }

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
      { commitment: 'confirmed' }
    );

    try {
      // Deserialize and submit transaction
      const recoveredTransaction = Transaction.from(
        Buffer.from(serializedTransaction, 'base64')
      );

      const signature = await connection.sendTransaction(recoveredTransaction, [], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      });

      console.log('Transaction sent:', signature);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature);

      if (confirmation.value.err) {
        const error = confirmation.value.err;
        console.error('Transaction failed:', error);

        // Handle specific error cases
        if (typeof error === 'object' && 'InstructionError' in error) {
          const instructionError = error.InstructionError as [number, {Custom?: number}];
          if (instructionError[1]?.Custom === 18) {
            return NextResponse.json(
              { error: 'Insufficient token balance' },
              { status: 400 }
            );
          }
        }

        return NextResponse.json(
          { error: 'Transaction failed', details: error },
          { status: 400 }
        );
      }

      return NextResponse.json({ signature });
    } catch (txError: unknown) {
      console.error('Transaction error:', txError);
      const errorMessage = txError instanceof Error ? txError.message : 'Unknown error';
      const errorType = txError instanceof Error ? txError.constructor.name : 'Unknown';
      
      return NextResponse.json(
        { 
          error: 'Transaction failed to submit', 
          details: errorMessage,
          type: errorType
        },
        { status: 400 }
      );
    }

  } catch (error: unknown) {
    console.error('Error submitting transaction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: 'Failed to submit transaction', details: errorMessage },
      { status: 500 }
    );
  }
}