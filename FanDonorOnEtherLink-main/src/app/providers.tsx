"use client";

import * as React from "react";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, http } from "wagmi";
import { type Chain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const etherlinkTestnet = {
  id: 127823,
  name: 'Etherlink Shadownet',
  nativeCurrency: {
    decimals: 18,
    name: 'XTZ',
    symbol: 'XTZ',
  },
  
  
  rpcUrls: {
    default: { http: ['https://node.shadownet.etherlink.com'] },
    public: { http: ['https://node.shadownet.etherlink.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherlink Explorer', url: 'https://testnet.explorer.etherlink.com/' },
  },
} as const satisfies Chain;

const config = getDefaultConfig({
  appName: "Fan Donation Platform",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  chains: [etherlinkTestnet],
  wallets: [
    {
      groupName: "Preferred",
      wallets: [metaMaskWallet],
    },
  ],
  transports: {
    [etherlinkTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "https://node.shadownet.etherlink.com"),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
