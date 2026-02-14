"use client";

import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { contractAddress, contractAbi } from "@/constants";
import { Loader2, Upload } from "lucide-react";
import Image from "next/image";

export default function MintPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  const { data: hash, writeContract, isPending: isMinting } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = 
    useWaitForTransactionReceipt({ 
      hash, 
    });

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

      if (!contractAddress) {
        throw new Error("Contract address is not defined in environment variables.");
      }

      toast({
        title: "Minting NFT...",
        description: "Please confirm the transaction in your wallet.",
      });

      writeContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'mintNFT',
        args: [tokenURI],
      });

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

            <Button onClick={handleMint} disabled={isProcessing} className="w-full">
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
