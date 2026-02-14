"use client";

import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId } from "wagmi";
import { contractAddress, contractAbi } from "@/constants";
import { Loader2, Upload } from "lucide-react";
import Image from "next/image";

// Fallback contract address in case env var is not set
const CONTRACT_ADDRESS = contractAddress || "0x7F8096DE700dBb72F87c80b4fff77FDb070dC66A";

export default function MintPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: hash, writeContract, isPending: isMinting, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = 
    useWaitForTransactionReceipt({ 
      hash, 
    });

  // Log contract address on mount
  React.useEffect(() => {
    console.log("Contract address from env:", contractAddress);
    console.log("Using contract address:", CONTRACT_ADDRESS);
    console.log("Contract address length:", CONTRACT_ADDRESS?.length);
    console.log("Starts with 0x:", CONTRACT_ADDRESS?.startsWith("0x"));
  }, []);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    handleFileChange(files);
  }, []);

  const handleMint = async () => {
    if (!file || !name || !description) {
      toast({
        title: "Error",
        description: "Please fill in all fields and select an image.",
        variant: "destructive",
      });
      return;
    }

    // Check wallet connection
    if (!isConnected || !address) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first using the Connect Wallet button.",
        variant: "destructive",
      });
      return;
    }

    // Check if on correct network
    if (chainId !== 127823) {
      toast({
        title: "Wrong Network",
        description: "Please switch to Etherlink Shadownet (Chain ID: 127823) in your wallet.",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Uploading to IPFS...",
        description: "Please wait while we upload your NFT to IPFS.",
      });

      // Upload to Pinata via server-side API route
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("description", description);

      console.log("Uploading to /api/pinata/upload...");
      const uploadRes = await fetch("/api/pinata/upload", {
        method: "POST",
        body: formData,
      });

      console.log("Upload response status:", uploadRes.status);

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({ error: "Unknown error" }));
        console.error("Upload error:", errData);
        throw new Error(errData.error || `Upload failed with status ${uploadRes.status}`);
      }

      const uploadData = await uploadRes.json();
      console.log("Upload response:", uploadData);
      const { tokenURI } = uploadData;

      if (!tokenURI) {
        throw new Error("Failed to get token URI from upload");
      }

      console.log("Token URI:", tokenURI);

      // Validate contract address before calling writeContract
      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS.length !== 42 || !CONTRACT_ADDRESS.startsWith("0x")) {
        console.error("Invalid contract address:", CONTRACT_ADDRESS);
        throw new Error(`Invalid contract address: ${CONTRACT_ADDRESS}. Please check environment variables.`);
      }

      console.log("Calling writeContract with:", {
        address: CONTRACT_ADDRESS,
        functionName: 'mintNFT',
        args: [tokenURI],
        account: address,
      });

      toast({
        title: "Minting NFT...",
        description: "Please confirm the transaction in your wallet.",
      });

      const result = writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: contractAbi,
        functionName: 'mintNFT',
        args: [tokenURI],
      });

      console.log("writeContract called, result:", result);

    } catch (error) {
      console.error("Minting error:", error);
      toast({
        title: "Minting Failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };
  
  React.useEffect(() => {
    if (isConfirmed) {
      toast({
        title: "Success!",
        description: `NFT minted successfully. Transaction hash: ${hash}`,
      });
      // Reset form
      setFile(null);
      setPreviewUrl(null);
      setName("");
      setDescription("");
    }
  }, [isConfirmed, hash, toast]);

  // Handle write errors
  React.useEffect(() => {
    if (writeError) {
      console.error("Write contract error:", writeError);
      toast({
        title: "Transaction Failed",
        description: writeError.message || "Failed to send transaction. Please try again.",
        variant: "destructive",
      });
    }
  }, [writeError, toast]);

  const isProcessing = isMinting || isConfirming;

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-80px)] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">Create Your NFT</CardTitle>
            <CardDescription className="text-center">Upload your artwork and provide the details below to mint it as a unique NFT.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div 
              className="border-2 border-dashed border-muted-foreground/50 rounded-lg p-8 text-center cursor-pointer hover:bg-accent transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input type="file" id="file-upload" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e.target.files)} />
              {previewUrl ? (
                <div className="relative w-full h-64">
                  <Image
                    src={previewUrl}
                    alt="Preview"
                    fill
                    className="rounded-md object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                  <Upload className="w-12 h-12" />
                  <p>Drag & drop your image here, or click to select a file</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="name">Name</label>
              <Input id="name" placeholder='e.g. "Sunset Over the Mountains"' value={name} onChange={(e) => setName(e.target.value)} disabled={isProcessing} />
            </div>

            <div className="space-y-2">
              <label htmlFor="description">Description</label>
              <Textarea id="description" placeholder="e.g. 'A beautiful painting capturing the serene sunset...'" value={description} onChange={(e) => setDescription(e.target.value)} disabled={isProcessing} />
            </div>

            {!isConnected && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Please connect your wallet using the "Connect Wallet" button in the navigation bar.
              </div>
            )}

            {isConnected && chainId !== 127823 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Wrong network! Please switch to Etherlink Shadownet (Chain ID: 127823) in your wallet.
              </div>
            )}

            <Button onClick={handleMint} disabled={isProcessing || !isConnected} className="w-full">
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Minting...
                </>
              ) : (
                "Mint NFT"
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
