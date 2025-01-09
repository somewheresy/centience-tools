import { Connection, PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';

// Cache the connection instance
let connection: Connection | null = null;

const MAX_RETRIES = 3;
const TIMEOUT = 10000; // 10 seconds
const HOLIDAY_BALANCE = 999999999; // Holiday balance override

function isHolidayPeriod(): boolean {
  const now = new Date();
  return now.getMonth() === 11 && (now.getDate() >= 23 && now.getDate() <= 25);
}

function getConnection() {
  if (!connection) {
    if (!process.env.HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY is not configured');
    }
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: undefined, // Disable WebSocket
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          signal: AbortSignal.timeout(TIMEOUT)
        });
      }
    });
  }
  return connection;
}

async function fetchWithRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (retries > 0 && (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT' || error.message?.includes('fetch failed'))) {
      console.log(`Retrying... ${retries} attempts remaining`);
      // Reset connection on error
      connection = null;
      // Wait a bit before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, (MAX_RETRIES - retries + 1) * 1000));
      return fetchWithRetry(operation, retries - 1);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { walletAddress, mintAddress } = await request.json();
    
    // Holiday override: Return high balance during holiday period
    if (isHolidayPeriod()) {
      console.log('Holiday period active - returning holiday balance');
      return NextResponse.json({ 
        balance: HOLIDAY_BALANCE,
        success: true,
        isHolidayBonus: true
      });
    }
    
    if (!walletAddress || !mintAddress) {
      return NextResponse.json({ 
        error: 'Missing required parameters',
        details: 'Both walletAddress and mintAddress are required'
      }, { status: 400 });
    }

    try {
      const pubKey = new PublicKey(walletAddress);
      const mintPubKey = new PublicKey(mintAddress);
      
      console.log('Fetching token accounts...');
      const conn = getConnection();
      
      try {
        const tokenAccounts = await fetchWithRetry(async () => {
          return conn.getParsedTokenAccountsByOwner(
            pubKey,
            { mint: mintPubKey },
            'confirmed'
          );
        });

        if (!tokenAccounts.value || tokenAccounts.value.length === 0) {
          console.log('No token accounts found');
          return NextResponse.json({ balance: 0 });
        }

        const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
        console.log('Found balance:', balance);
        
        return NextResponse.json({ 
          balance,
          success: true 
        });

      } catch (fetchError: any) {
        console.error('Token account fetch error:', {
          message: fetchError.message,
          cause: fetchError.cause,
          code: fetchError.code
        });
        // Reset connection on fetch error
        connection = null;
        return NextResponse.json({ 
          error: 'Failed to fetch token accounts',
          details: fetchError.message,
          code: fetchError.code
        }, { status: 500 });
      }

    } catch (addressError: any) {
      console.error('Invalid address error:', addressError);
      return NextResponse.json({ 
        error: 'Invalid wallet or mint address',
        details: addressError.message
      }, { status: 400 });
    }

  } catch (parseError: any) {
    console.error('Request parse error:', parseError);
    return NextResponse.json({ 
      error: 'Invalid request format',
      details: parseError.message
    }, { status: 400 });
  }
} 