"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from "wagmi";
import { contractAddress, contractAbi } from "@/constants";
import Image from "next/image";
import { formatEther, parseEther } from "viem";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import Confetti from 'react-confetti';
import { Loader2 } from "lucide-react";

import { type NftData } from "../app/page";

interface NFTCardProps {
  nft: NftData;
  onDelete?: (tokenId: number) => void;
  onDonation?: (payload: { donor: string; amount: bigint; tokenId: number }) => void;
  onTotalsChange?: () => void;
}

interface NftMetadata {
    name: string;
    description: string;
    image: string;
}

export default function NFTCard({ nft, onDelete, onDonation, onTotalsChange }: NFTCardProps) {
  const { tokenId, metadata, owner, totalDonations } = nft;
  const [donationAmount, setDonationAmount] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const { toast } = useToast();

  const { data: hash, writeContract, isPending: isDonating } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed, refetch } = 
    useWaitForTransactionReceipt({ 
      hash, 
    });

  useEffect(() => {
    if (isConfirmed) {
      toast({
        title: "Fan Donation Successful!",
        description: "Thank you for your support!",
      });
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      // We will need a way to refetch the data on the parent component
      setDonationAmount("");
    }
  }, [isConfirmed, toast]);

  const handleDonate = () => {
    if (!donationAmount || parseFloat(donationAmount) <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid fan donation amount.", variant: "destructive" });
      return;
    }
    if (!contractAddress) {
      toast({ title: "Error", description: "Contract address is not configured.", variant: "destructive" });
      return;
    }
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'donate',
      args: [BigInt(tokenId)],
      value: parseEther(donationAmount),
    });
  };

  const shortenedAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  const isProcessing = isDonating || isConfirming;

  const computedTotalDonations = totalDonations ?? 0n;

  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'DonationReceived',
    pollingInterval: 5000,
    onLogs(logs) {
      const filteredLogs = logs.filter(
        (log) => (log as any).args.tokenId === BigInt(tokenId)
      );
      if (filteredLogs.length > 0) {
        setEvents((prevEvents) => [...filteredLogs, ...prevEvents]);

        if (onTotalsChange) {
          onTotalsChange();
        }

        if (onDonation) {
          filteredLogs.forEach((log) => {
            const args = (log as any).args;
            const donor = args?.donor as string | undefined;
            const amount = args?.amount as bigint | undefined;

            if (donor && typeof donor === "string" && typeof amount === "bigint") {
              onDonation({ donor, amount, tokenId });
            }
          });
        }
      }
    },
  });

  return (
    <>
      {showConfetti && <Confetti />}
      <Card className="overflow-hidden">
        <CardHeader className="p-0">
          <div className="relative w-full h-64">
            {metadata?.image ? (
              <Image
                src={metadata.image}
                alt={metadata.name || ''}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-secondary rounded-t-lg animate-pulse"></div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          <CardTitle>{metadata?.name || `NFT #${tokenId}`}</CardTitle>
          <p className="text-sm text-muted-foreground truncate">{metadata?.description}</p>
          {typeof owner === 'string' && <p className="text-xs">Owned by: {shortenedAddress(owner)}</p>}
        </CardContent>
        <CardFooter className="flex justify-between items-center p-4 bg-muted/50">
          <div>
              <p className="text-sm font-bold">{`${formatEther(computedTotalDonations)} ETH`}</p>
              <p className="text-xs text-muted-foreground">Total Fan Donations</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={isProcessing}>Fan Donate</Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>Fan Donate to {metadata?.name || `NFT #${tokenId}`}</DialogTitle>
              <DialogDescription>Your support helps the creator. Enter the amount of ETH you'd like to donate.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                <div>
                  <Input 
                    type="number" 
                    placeholder="0.05 ETH" 
                    value={donationAmount} 
                    onChange={(e) => setDonationAmount(e.target.value)} 
                    disabled={isProcessing}
                  />
                </div>
                <Button onClick={handleDonate} disabled={isProcessing} className="w-full">
                  {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Confirm Fan Donation"}
                </Button>
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Recent Fan Donations</h4>
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                        {events.length > 0 ? (
                            events.map((event, index) => (
                                <div key={index} className="text-xs text-muted-foreground flex justify-between">
                                    <span>{shortenedAddress((event as any).args.donor)}</span>
                                    <span>{formatEther((event as any).args.amount)} ETH</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-muted-foreground">No fan donations yet.</p>
                        )}
                    </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </>
  );
}
