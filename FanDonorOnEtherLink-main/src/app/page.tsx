"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { contractAddress, contractAbi } from "@/constants";
import { type Abi } from 'viem';
import Image from 'next/image';
import NFTCard from "@/components/NFTCard";
import SkeletonCard from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatEther } from "viem";

export interface NftData {
  tokenId: number;
  metadata: any;
  owner: string;
  totalDonations: bigint;
}

interface DonorStat {
  total: bigint;
  donations: { tokenId: number; amount: bigint; name?: string }[];
}

export default function Home() {
  const [nfts, setNfts] = useState<NftData[]>([]);
  const [hiddenTokenIds, setHiddenTokenIds] = useState<number[]>([]);
  const [donorStats, setDonorStats] = useState<Record<string, DonorStat>>({});
  const [topDonors, setTopDonors] = useState<Array<{ address: string; total: bigint; nftsDonatedTo: number }>>([]);
  const [isLoadingDonors, setIsLoadingDonors] = useState(false);

  const { data: totalSupply, isLoading: isLoadingTotalSupply } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: "totalSupply",
    query: {
      enabled: Boolean(contractAddress),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: false,
      refetchOnMount: "always",
    },
  });

  const visibleNfts = useMemo(
    () => nfts.filter((nft) => !hiddenTokenIds.includes(nft.tokenId)),
    [nfts, hiddenTokenIds]
  );

  const nftIds = useMemo(
    () => Array.from({ length: Number(totalSupply || 0) }, (_, i) => i + 1),
    [totalSupply]
  );

  const { data: nftData, isLoading: isLoadingNftData, refetch: refetchNftData } = useReadContracts({
    contracts: nftIds.flatMap(id => [
      { address: contractAddress, abi: contractAbi as Abi, functionName: 'tokenURI', args: [BigInt(id)] },
      { address: contractAddress, abi: contractAbi as Abi, functionName: 'ownerOf', args: [BigInt(id)] },
      { address: contractAddress, abi: contractAbi as Abi, functionName: 'totalDonations', args: [BigInt(id)] },
    ]),
    query: {
      enabled: Boolean(contractAddress) && nftIds.length > 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: false,
      refetchOnMount: "always",
    },
  });

  useEffect(() => {
    if (nftData) {
      const fetchAllMetadata = async () => {
        const formattedNfts = await Promise.all(nftIds.map(async (id, index) => {
          const tokenURI = nftData[index * 3].result as string;
          const owner = nftData[index * 3 + 1].result as string;
          const totalDonationsRaw = nftData[index * 3 + 2]?.result as bigint | undefined;
          const totalDonations = totalDonationsRaw ?? 0n;

          let metadata = {};
          try {
            const response = await fetch(tokenURI);
            metadata = await response.json();
          } catch (error) {
            console.error(`Failed to fetch metadata for token ${id}:`, error);
          }

          return { tokenId: id, metadata, owner, totalDonations };
        }));
        setNfts(formattedNfts);
      };
      fetchAllMetadata();
    }
  }, [nftData, nftIds]);

  const topDonatedNfts = [...visibleNfts]
    .sort((a, b) => Number(b.totalDonations) - Number(a.totalDonations))
    .slice(0, 10);

  const isLoading = isLoadingTotalSupply || (Number(totalSupply) > 0 && isLoadingNftData);

  const totalDonationsAll = useMemo(
    () => visibleNfts.reduce((sum, nft) => sum + (nft.totalDonations ?? 0n), 0n),
    [visibleNfts]
  );

  const topSupportedNames = useMemo(() => {
    if (topDonatedNfts.length === 0) return "No support yet";
    return topDonatedNfts
      .slice(0, 3)
      .map((nft) => nft.metadata?.name || `NFT #${nft.tokenId}`)
      .join(", ");
  }, [topDonatedNfts]);

  const handleDeleteNft = useCallback((tokenId: number) => {
    setHiddenTokenIds((prev) => (prev.includes(tokenId) ? prev : [...prev, tokenId]));
  }, []);

  // Fetch top donors from blockchain
  const fetchTopDonors = useCallback(async () => {
    if (!totalSupply || !contractAddress) {
      return;
    }

    try {
      setIsLoadingDonors(true);
      const donorMap = new Map<string, { totalAmount: bigint; nftsDonatedTo: number }>();

      // Fetch donation data for all NFTs
      for (let tokenId = 1; tokenId <= Number(totalSupply); tokenId++) {
        try {
          const response = await fetch(`/api/donations/${tokenId}`);
          
          if (!response.ok) continue;
          
          const donations = await response.json();

          // Aggregate donations by donor address
          donations.forEach((donation: { donor: string; amount: string }) => {
            const existing = donorMap.get(donation.donor);
            if (existing) {
              existing.totalAmount += BigInt(donation.amount);
              existing.nftsDonatedTo += 1;
            } else {
              donorMap.set(donation.donor, {
                totalAmount: BigInt(donation.amount),
                nftsDonatedTo: 1,
              });
            }
          });
        } catch (err) {
          console.error(`Error fetching donations for token ${tokenId}:`, err);
        }
      }

      // Convert to array and sort by total amount
      const sortedDonors = Array.from(donorMap.entries())
        .map(([address, data]) => ({
          address,
          total: data.totalAmount,
          nftsDonatedTo: data.nftsDonatedTo,
        }))
        .sort((a, b) => (b.total > a.total ? 1 : -1))
        .slice(0, 10); // Top 10

      setTopDonors(sortedDonors);
    } catch (error) {
      console.error("Error fetching donor data:", error);
    } finally {
      setIsLoadingDonors(false);
    }
  }, [totalSupply, contractAddress]);

  const handleTotalsChange = useCallback(() => {
    refetchNftData();
    fetchTopDonors(); // Also refresh top donors
  }, [refetchNftData, fetchTopDonors]);

  const handleDonation = useCallback(
    ({ donor, amount, tokenId }: { donor: string; amount: bigint; tokenId: number }) => {
      setDonorStats((prev) => {
        const current = prev[donor] ?? { total: 0n, donations: [] };
        const nft = nfts.find((nft) => nft.tokenId === tokenId);

        return {
          ...prev,
          [donor]: {
            total: current.total + amount,
            donations: [
              ...current.donations,
              { tokenId, amount, name: nft?.metadata?.name },
            ],
          },
        };
      });
      // Refetch top donors from blockchain after donation
      fetchTopDonors();
    },
    [nfts, fetchTopDonors]
  );

  // Fetch top donors when NFTs are loaded
  useEffect(() => {
    if (nfts.length > 0) {
      fetchTopDonors();
    }
  }, [nfts.length, fetchTopDonors]);

  return (
    <main className="container mx-auto px-4 py-10 space-y-10">
      <section className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Explore impact NFTs
          </h1>
          <p className="text-muted-foreground max-w-xl text-sm md:text-base">
            Discover NFTs, support creators, and track the most supported drops in the
            community.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl border bg-card dark:bg-gradient-to-br dark:from-slate-900/60 dark:to-slate-800/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">NFTs</p>
            <p className="text-lg font-semibold">{visibleNfts.length}</p>
          </div>
          <div className="rounded-xl border bg-card dark:bg-gradient-to-br dark:from-slate-900/60 dark:to-emerald-900/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Total fan donations</p>
            <p className="text-lg font-semibold">
              {nfts.length > 0 ? `${formatEther(totalDonationsAll)} ETH` : "0 ETH"}
            </p>
          </div>
          <div className="rounded-xl border bg-card dark:bg-gradient-to-br dark:from-slate-900/60 dark:to-indigo-900/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Top supported</p>
            <p className="text-sm font-semibold truncate">{topSupportedNames}</p>
          </div>
        </div>
      </section>

      {visibleNfts.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-800/80 p-6">
            <h2 className="text-xl font-semibold mb-1">Top Supported NFTs</h2>
            <p className="text-sm text-muted-foreground mb-4">
              NFTs with the highest total fan donations.
            </p>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {topDonatedNfts.map((nft, index) => (
                <div
                  key={nft.tokenId}
                  className="flex items-center justify-between rounded-lg bg-background/60 p-3"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-sm font-semibold text-muted-foreground w-6 text-right">
                      #{index + 1}
                    </span>
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border">
                      <Image
                        src={nft.metadata.image}
                        alt={nft.metadata.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{nft.metadata.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatEther(nft.totalDonations)} ETH fan donations
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-card dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-800/80 p-6">
            <h2 className="text-xl font-semibold mb-1">Top Fan Donors</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Most generous supporters across all NFTs (all-time).
            </p>
            {isLoadingDonors ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2 animate-pulse">
                    <div className="w-6 h-4 bg-muted rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted rounded w-24" />
                      <div className="h-2 bg-muted rounded w-16" />
                    </div>
                    <div className="h-4 bg-muted rounded w-16" />
                  </div>
                ))}
              </div>
            ) : topDonors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No fan donations yet. Be the first to support a creator.
              </p>
            ) : (
              <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {topDonors.map((entry, index) => (
                  <li
                    key={entry.address}
                    className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-semibold text-muted-foreground w-6 text-right">
                        #{index + 1}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Donated to {entry.nftsDonatedTo} NFT{entry.nftsDonatedTo !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatEther(entry.total)} XTZ
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-semibold mb-4">All NFTs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            : visibleNfts.length > 0
            ? visibleNfts.map((nft) => (
                <NFTCard
                  key={nft.tokenId}
                  nft={nft}
                  onDonation={handleDonation}
                  onTotalsChange={handleTotalsChange}
                />
              ))
            : !isLoadingTotalSupply && (
                <div className="col-span-full text-center py-10">
                  <p className="mb-4 text-muted-foreground">
                    No NFTs found yet. Be the first to mint and support a cause.
                  </p>
                  <Button asChild>
                    <Link href="/mint">Mint an NFT</Link>
                  </Button>
                </div>
              )}
        </div>
      </section>
    </main>
  );
}
